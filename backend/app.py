"""MES Lini Perakitan Mobil Mini (versi sederhana): backend Flask + SQLite.

Pembagian tugas:
- Frontend menjalankan simulasi dan mengirim hasil tiap unit.
- Backend memvalidasi, menilai OK/NG (4 roda = OK), mencatat ke database, dan menghitung KPI.
Semua data berasal dari simulasi, bukan mesin fisik."""
import json
import math
import os
import random
import sqlite3
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request

app = Flask(__name__)

HERE = os.path.dirname(os.path.abspath(__file__))
STATIONS = {"loading": "Chassis Loading", "assembly": "Wheel Assembly", "inspection": "Quality Inspection"}
IDEAL_CYCLE = 7.0  # detik: loading 2 + assembly 3 + inspeksi 2 (konstanta simulasi, bukan standar industri)


# ---------- database ----------
def db_path():
    return os.environ.get("MES_DB", os.path.join(HERE, "mes.db"))  # dibaca tiap saat agar tes bisa pakai DB sementara


def init_db():
    conn = sqlite3.connect(db_path())
    with open(os.path.join(HERE, "schema.sql"), encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


def db():
    if "db" not in g:
        g.db = sqlite3.connect(db_path())
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now():
    return datetime.now(timezone.utc)


def stamp(dt=None):
    return (dt or now()).isoformat(timespec="milliseconds")


def log_event(conn, wo_id, message):
    conn.execute("INSERT INTO event_logs (work_order_id, message, created_at) VALUES (?,?,?)", (wo_id, message, stamp()))


# ---------- respons ----------
def ok(data=None, status=200):
    return jsonify({"success": True, "data": data, "error": None}), status


def fail(message, status=400, details=None):
    return jsonify({"success": False, "data": None, "error": {"message": message, "details": details}}), status


def as_int(v):
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else None


def as_num(v):
    if isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def get_wo(conn, wo_id):
    if wo_id is None:
        return conn.execute("SELECT * FROM work_orders ORDER BY id DESC LIMIT 1").fetchone()
    return conn.execute("SELECT * FROM work_orders WHERE id = ?", (as_int(wo_id),)).fetchone()


# ---------- KPI ----------
def build_dashboard(conn, wo):
    r = conn.execute(
        """SELECT COUNT(*) AS total, COALESCE(SUM(status = 'OK'), 0) AS good,
                  COALESCE(SUM(status = 'NG'), 0) AS defect, COALESCE(SUM(cycle_seconds), 0) AS run_time
           FROM production_logs WHERE work_order_id = ?""", (wo["id"],)).fetchone()
    total, good, defect, run_time = r["total"], r["good"], r["defect"], r["run_time"]

    by_station, active = {}, None
    for d in conn.execute("SELECT * FROM downtime_logs WHERE work_order_id = ?", (wo["id"],)):
        if d["ended_at"] is None:
            active = d["station"]
            dur = (now() - datetime.fromisoformat(d["started_at"])).total_seconds()
        else:
            dur = d["duration_seconds"]
        by_station[d["station"]] = by_station.get(d["station"], 0.0) + dur
    downtime = sum(by_station.values())

    oee = {"availability": None, "performance": None, "quality": None, "oee": None}
    if total > 0 and run_time > 0:  # OEE = estimasi (bonus)
        a = run_time / (run_time + downtime)
        p = min(IDEAL_CYCLE * total / run_time, 1.0)
        q = good / total
        oee = {"availability": a, "performance": p, "quality": q, "oee": a * p * q}

    return {
        "work_order": {"id": wo["id"], "code": wo["code"], "product_name": wo["product_name"],
                       "target_qty": wo["target_qty"], "ng_rate": wo["ng_rate"], "status": wo["status"],
                       "ng_units": json.loads(wo["ng_units"])},
        "output": total, "good": good, "defect": defect,
        "progress": min(total / wo["target_qty"], 1.0),
        "quality_rate": (good / total) if total else None,      # pecahan 0-1
        "avg_cycle_seconds": (run_time / total) if total else None,
        "downtime_seconds": downtime, "downtime_by_station": by_station, "active_downtime": active,
        "next_unit_no": total + 1,
        **oee,
    }


# ---------- endpoint ----------
@app.get("/api/health")
def health():
    return ok({"status": "up"})


@app.post("/api/work-orders")
def create_work_order():
    body = request.get_json(silent=True) or {}
    target, rate = as_int(body.get("target_qty")), as_num(body.get("ng_rate"))
    product = str(body.get("product_name") or "Mobil mini").strip()
    errors = []
    if target is None or not 1 <= target <= 100:
        errors.append("target_qty harus bilangan bulat 1-100")
    if rate is None or not 0 <= rate <= 100:
        errors.append("ng_rate harus angka 0-100")
    if errors:
        return fail("Input tidak valid", 400, errors)

    ng_count = math.floor(target * rate / 100 + 0.5)              # dibulatkan (0,5 ke atas naik)
    ng_units = sorted(random.sample(range(1, target + 1), ng_count))  # posisi unit NG diacak

    conn = db()
    next_id = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM work_orders").fetchone()[0]
    code = f"WO-ASM-{next_id:04d}"
    conn.execute("UPDATE work_orders SET status = 'Stopped' WHERE status = 'Running'")  # satu work order aktif
    cur = conn.execute(
        "INSERT INTO work_orders (code, product_name, target_qty, ng_rate, ng_units, status, created_at) VALUES (?,?,?,?,?,?,?)",
        (code, product, target, rate, json.dumps(ng_units), "Running", stamp()))
    log_event(conn, cur.lastrowid, f"{code} dibuat: target {target} unit, rencana NG {ng_count} unit")
    conn.commit()
    return ok(build_dashboard(conn, get_wo(conn, cur.lastrowid)), 201)


@app.post("/api/units/finish")
def finish_unit():
    body = request.get_json(silent=True) or {}
    conn = db()
    wo = get_wo(conn, body.get("work_order_id")) if body.get("work_order_id") is not None else None
    if wo is None:
        return fail("work_order_id tidak ditemukan", 404)
    unit_no, wheels, cycle = as_int(body.get("unit_no")), as_int(body.get("wheels_installed")), as_num(body.get("cycle_seconds"))
    errors = []
    if unit_no is None or unit_no < 1:
        errors.append("unit_no harus bilangan bulat >= 1")
    if wheels is None or not 0 <= wheels <= 4:
        errors.append("wheels_installed harus bilangan bulat 0-4")
    if cycle is None or cycle < 0:
        errors.append("cycle_seconds harus angka >= 0")
    if errors:
        return fail("Input tidak valid", 400, errors)
    if wo["status"] != "Running":
        return fail(f"Work order berstatus {wo['status']}, hasil unit tidak diterima", 409)
    if unit_no > wo["target_qty"]:
        return fail("unit_no melebihi target work order", 409)

    status = "OK" if wheels == 4 else "NG"          # aturan kualitas: 4 roda terpasang = OK
    reason = None if status == "OK" else "Missing wheel"
    try:
        conn.execute(
            """INSERT INTO production_logs (work_order_id, unit_no, status, reason, wheels_installed, cycle_seconds, finished_at)
               VALUES (?,?,?,?,?,?,?)""", (wo["id"], unit_no, status, reason, wheels, cycle, stamp()))
    except sqlite3.IntegrityError:
        conn.rollback()
        return fail(f"Hasil UNIT-{unit_no:03d} sudah tercatat", 409)
    log_event(conn, wo["id"], f"UNIT-{unit_no:03d} selesai inspeksi: {status}" + (f" ({reason})" if reason else ""))
    output = conn.execute("SELECT COUNT(*) FROM production_logs WHERE work_order_id = ?", (wo["id"],)).fetchone()[0]
    wo_status = wo["status"]
    if output >= wo["target_qty"]:
        conn.execute("UPDATE work_orders SET status = 'Completed' WHERE id = ?", (wo["id"],))
        log_event(conn, wo["id"], f"Target {wo['target_qty']} unit tercapai, work order Completed")
        wo_status = "Completed"
    conn.commit()
    return ok({"unit_no": unit_no, "status": status, "reason": reason, "output": output, "work_order_status": wo_status})


@app.post("/api/downtime/start")
def downtime_start():
    body = request.get_json(silent=True) or {}
    conn = db()
    wo = get_wo(conn, body.get("work_order_id")) if body.get("work_order_id") is not None else None
    if wo is None:
        return fail("work_order_id tidak ditemukan", 404)
    station = body.get("station", "assembly")
    if station not in STATIONS:
        return fail("station tidak valid", 400, list(STATIONS))
    if wo["status"] != "Running":
        return fail(f"Work order berstatus {wo['status']}", 409)
    if conn.execute("SELECT 1 FROM downtime_logs WHERE work_order_id = ? AND ended_at IS NULL", (wo["id"],)).fetchone():
        return fail("Masih ada downtime yang aktif", 409)
    conn.execute("INSERT INTO downtime_logs (work_order_id, station, started_at) VALUES (?,?,?)", (wo["id"], station, stamp()))
    log_event(conn, wo["id"], f"Downtime dimulai di {STATIONS[station]}")
    conn.commit()
    return ok({"station": station})


def close_downtime(conn, wo_id):
    d = conn.execute("SELECT * FROM downtime_logs WHERE work_order_id = ? AND ended_at IS NULL", (wo_id,)).fetchone()
    if d is None:
        return None
    end = now()
    dur = round((end - datetime.fromisoformat(d["started_at"])).total_seconds(), 2)
    conn.execute("UPDATE downtime_logs SET ended_at = ?, duration_seconds = ? WHERE id = ?", (stamp(end), dur, d["id"]))
    log_event(conn, wo_id, f"Downtime {STATIONS[d['station']]} berakhir ({dur:.1f} s)")
    return {"station": d["station"], "duration_seconds": dur}


@app.post("/api/downtime/end")
def downtime_end():
    body = request.get_json(silent=True) or {}
    conn = db()
    wo = get_wo(conn, body.get("work_order_id")) if body.get("work_order_id") is not None else None
    if wo is None:
        return fail("work_order_id tidak ditemukan", 404)
    result = close_downtime(conn, wo["id"])
    if result is None:
        return fail("Tidak ada downtime yang aktif", 409)
    conn.commit()
    return ok(result)


@app.get("/api/dashboard")
def dashboard():
    conn = db()
    wo = get_wo(conn, request.args.get("work_order_id"))   # tanpa parameter: work order terbaru
    return ok(build_dashboard(conn, wo) if wo else None)


@app.get("/api/events")
def events():
    conn = db()
    wo = get_wo(conn, request.args.get("work_order_id"))
    if wo is None:
        return ok([])
    limit = min(max(request.args.get("limit", 15, type=int), 1), 100)
    rows = conn.execute("SELECT message, created_at FROM event_logs WHERE work_order_id = ? ORDER BY id DESC LIMIT ?",
                        (wo["id"], limit)).fetchall()
    return ok([dict(r) for r in rows])


@app.post("/api/reset")
def reset():
    """Reset = hentikan work order aktif. Data TIDAK dihapus; work order baru dibuat dari frontend."""
    body = request.get_json(silent=True) or {}
    conn = db()
    wo = get_wo(conn, body.get("work_order_id")) if body.get("work_order_id") is not None else None
    if wo is None:
        return fail("work_order_id tidak ditemukan", 404)
    if wo["status"] == "Running":
        close_downtime(conn, wo["id"])
        conn.execute("UPDATE work_orders SET status = 'Stopped' WHERE id = ?", (wo["id"],))
        log_event(conn, wo["id"], "Run dihentikan (reset)")
        conn.commit()
    return ok({"work_order_id": wo["id"], "status": "Stopped" if wo["status"] == "Running" else wo["status"]})


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
