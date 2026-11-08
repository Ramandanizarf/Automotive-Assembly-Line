import os
import sys
import tempfile
import time
import unittest

os.environ["MES_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")   # harus sebelum import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module  # noqa: E402


class ApiTest(unittest.TestCase):
    def setUp(self):
        if os.path.exists(app_module.db_path()):
            os.remove(app_module.db_path())
        app_module.init_db()
        self.c = app_module.app.test_client()

    def post(self, url, body=None):
        r = self.c.post(url, json=body or {})
        return r.status_code, r.get_json()

    def make_wo(self, target=10, rate=20):
        code, body = self.post("/api/work-orders", {"target_qty": target, "ng_rate": rate})
        self.assertEqual(code, 201, body)
        return body["data"]

    def finish(self, wo_id, n, wheels=4, cycle=7.0):
        return self.post("/api/units/finish", {"work_order_id": wo_id, "unit_no": n, "wheels_installed": wheels, "cycle_seconds": cycle})

    # --- work order ---
    def test_buat_wo_dan_jumlah_ng_pasti(self):
        wo = self.make_wo(20, 15)["work_order"]
        self.assertEqual(wo["code"], "WO-ASM-0001")
        self.assertEqual(wo["status"], "Running")
        self.assertEqual(len(wo["ng_units"]), 3)                     # 20 x 15% = 3
        self.assertEqual(len(set(wo["ng_units"])), 3)                # nomor unit tidak ada yang kembar
        self.assertTrue(all(1 <= u <= 20 for u in wo["ng_units"]))

    def test_pembulatan_dan_batas(self):
        self.assertEqual(len(self.make_wo(10, 15)["work_order"]["ng_units"]), 2)    # 1,5 -> 2
        self.assertEqual(len(self.make_wo(20, 0)["work_order"]["ng_units"]), 0)
        self.assertEqual(len(self.make_wo(10, 100)["work_order"]["ng_units"]), 10)

    def test_input_tidak_valid_ditolak(self):
        for body in ({"target_qty": 0, "ng_rate": 10}, {"target_qty": 10, "ng_rate": 150}, {"target_qty": "abc", "ng_rate": 10},
                     {"target_qty": 10, "ng_rate": -1}, {"target_qty": 10}, {}):
            code, res = self.post("/api/work-orders", body)
            self.assertEqual(code, 400, body)
            self.assertTrue(res["error"]["details"])

    def test_hanya_satu_wo_aktif(self):
        a = self.make_wo()["work_order"]["id"]
        self.make_wo()
        self.assertEqual(self.c.get(f"/api/dashboard?work_order_id={a}").get_json()["data"]["work_order"]["status"], "Stopped")

    # --- hasil unit ---
    def test_siklus_ok_ng_completed_dan_kpi(self):
        wo = self.make_wo(4, 25)["work_order"]            # 1 NG dari 4 unit
        wid = wo["id"]
        results = []
        for n in range(1, 5):
            wheels = 3 if n in wo["ng_units"] else 4
            code, res = self.finish(wid, n, wheels, 7.0)
            self.assertEqual(code, 200)
            results.append(res["data"]["status"])
        self.assertEqual(results.count("NG"), 1)
        d = self.c.get("/api/dashboard").get_json()["data"]
        self.assertEqual((d["output"], d["good"], d["defect"]), (4, 3, 1))
        self.assertEqual(d["good"] + d["defect"], d["output"])
        self.assertAlmostEqual(d["quality_rate"], 0.75)
        self.assertAlmostEqual(d["avg_cycle_seconds"], 7.0)
        self.assertEqual(d["work_order"]["status"], "Completed")
        self.assertEqual(d["progress"], 1.0)
        evs = [e["message"] for e in self.c.get("/api/events?limit=50").get_json()["data"]]
        self.assertTrue(any("Missing wheel" in m for m in evs))
        self.assertTrue(any("Completed" in m for m in evs))

    def test_aturan_ok_ng_berdasarkan_roda(self):
        wid = self.make_wo(10, 0)["work_order"]["id"]
        self.assertEqual(self.finish(wid, 1, 4)[1]["data"]["status"], "OK")
        for n, w in ((2, 3), (3, 0)):
            data = self.finish(wid, n, w)[1]["data"]
            self.assertEqual((data["status"], data["reason"]), ("NG", "Missing wheel"))

    def test_validasi_unit(self):
        wid = self.make_wo(3, 0)["work_order"]["id"]
        self.assertEqual(self.finish(wid, 1, 5)[0], 400)                 # roda > 4
        self.assertEqual(self.finish(wid, 1, 4, -1)[0], 400)             # cycle negatif
        self.assertEqual(self.finish(wid, 0, 4)[0], 400)                 # unit_no < 1
        self.assertEqual(self.finish(wid, 4, 4)[0], 409)                 # melebihi target
        self.assertEqual(self.finish(wid, 1, 4)[0], 200)
        self.assertEqual(self.finish(wid, 1, 4)[0], 409)                 # unit ganda
        self.assertEqual(self.finish(999, 1, 4)[0], 404)
        self.assertEqual(self.c.get("/api/dashboard").get_json()["data"]["output"], 1)

    def test_unit_ditolak_jika_wo_selesai(self):
        wid = self.make_wo(1, 0)["work_order"]["id"]
        self.finish(wid, 1, 4)
        self.assertEqual(self.finish(wid, 2, 4)[0], 409)

    # --- downtime ---
    def test_downtime_start_end_dan_kpi(self):
        wid = self.make_wo()["work_order"]["id"]
        self.assertEqual(self.post("/api/downtime/start", {"work_order_id": wid})[0], 200)
        self.assertEqual(self.post("/api/downtime/start", {"work_order_id": wid})[0], 409)       # dobel ditolak
        self.assertEqual(self.c.get("/api/dashboard").get_json()["data"]["active_downtime"], "assembly")
        time.sleep(0.25)
        code, res = self.post("/api/downtime/end", {"work_order_id": wid})
        self.assertEqual(code, 200)
        self.assertGreaterEqual(res["data"]["duration_seconds"], 0.2)
        d = self.c.get("/api/dashboard").get_json()["data"]
        self.assertGreaterEqual(d["downtime_seconds"], 0.2)
        self.assertIsNone(d["active_downtime"])
        self.assertEqual(self.post("/api/downtime/end", {"work_order_id": wid})[0], 409)         # tidak ada yang aktif
        self.assertEqual(self.post("/api/downtime/start", {"work_order_id": wid, "station": "xxx"})[0], 400)

    # --- reset & dashboard kosong ---
    def test_reset_tidak_menghapus_data(self):
        wid = self.make_wo(5, 0)["work_order"]["id"]
        self.finish(wid, 1, 4)
        self.post("/api/downtime/start", {"work_order_id": wid})
        code, res = self.post("/api/reset", {"work_order_id": wid})
        self.assertEqual((code, res["data"]["status"]), (200, "Stopped"))
        d = self.c.get(f"/api/dashboard?work_order_id={wid}").get_json()["data"]
        self.assertEqual(d["output"], 1)                                  # data lama tetap
        self.assertIsNone(d["active_downtime"])                           # downtime aktif ikut ditutup
        self.assertEqual(self.post("/api/reset", {"work_order_id": wid})[0], 200)               # idempotent
        self.assertEqual(self.finish(wid, 2, 4)[0], 409)

    def test_dashboard_kosong_dan_health(self):
        self.assertIsNone(self.c.get("/api/dashboard").get_json()["data"])
        self.assertEqual(self.c.get("/api/events").get_json()["data"], [])
        self.assertEqual(self.c.get("/api/health").get_json()["data"]["status"], "up")

    def test_oee_estimasi(self):
        wid = self.make_wo(10, 0)["work_order"]["id"]
        self.assertIsNone(self.c.get("/api/dashboard").get_json()["data"]["oee"])               # N/A sebelum ada output
        for n in (1, 2):
            self.finish(wid, n, 4, 7.0)
        d = self.c.get("/api/dashboard").get_json()["data"]
        self.assertAlmostEqual(d["quality"], 1.0)
        self.assertAlmostEqual(d["performance"], 1.0)
        self.assertAlmostEqual(d["oee"], 1.0)


if __name__ == "__main__":
    unittest.main()
