// Engine simulasi: state machine + timer. Tidak menyentuh DOM atau Three.js.
// Engine HANYA menggerakkan proses dan melapor ke backend; semua angka KPI dihitung backend.
import { api } from "./api.js";

export const STATIONS = ["loading", "assembly", "inspection"];
export const DURATION = [2, 3, 2]; // detik simulasi per station (konstanta, bukan standar industri)
const EPS = 1e-9;

export class Engine extends EventTarget {
  constructor() {
    super();
    this.forceNG = false;
    this.clear();
  }

  clear() {
    this.wo = null;
    this.ngUnits = new Set(); // nomor unit yang dijadwalkan NG (dari backend)
    this.status = "idle"; // idle | ready | running | paused | completed
    this.stations = { loading: "idle", assembly: "idle", inspection: "idle" };
    this.unit = null; // { no, wheels, stage (0-2 station, 3 = menunggu hasil), elapsed, cycle, started }
    this.nextUnit = 1;
    this.awaiting = false; // menunggu jawaban backend
    this.downtime = false;
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // dashboard = data dari POST /work-orders atau GET /dashboard
  load(dash) {
    this.clear();
    if (dash) {
      this.wo = dash.work_order;
      this.ngUnits = new Set(dash.work_order.ng_units);
      this.nextUnit = dash.next_unit_no;
      const s = this.wo.status;
      this.status = s === "Completed" ? "completed" : s === "Running" ? "ready" : "idle";
      if (this.status === "ready" && dash.active_downtime) api.downtimeEnd(this.wo.id).catch(() => {}); // sisa downtime sebelum refresh ditutup
    }
    this.emit("loaded");
    this.emit("change");
  }

  // ---------- kontrol ----------
  start() {
    if (this.status !== "ready") return;
    this.status = "running";
    this.emit("change");
  }

  pause() {
    if (this.status !== "running" || this.downtime) return; // saat downtime, pause tidak diizinkan
    this.status = "paused";
    this.emit("change");
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.emit("change");
  }

  triggerDowntime() {
    if (this.status !== "running" || this.downtime) return;
    this.downtime = true; // unit di Wheel Assembly langsung berhenti
    this.stations.assembly = "down";
    this.emit("change");
    api.downtimeStart(this.wo.id, "assembly").catch((e) => this.fail(e));
  }

  recover() {
    if (!this.downtime) return;
    this.downtime = false;
    this.stations.assembly = this.unit && this.unit.stage === 1 ? "running" : "idle";
    this.emit("change");
    api.downtimeEnd(this.wo.id).catch((e) => this.fail(e));
  }

  fail(e) {
    if (this.status === "running") this.status = "paused";
    this.awaiting = false;
    this.emit("error", e.message || String(e));
    this.emit("change");
  }

  // ---------- loop simulasi ----------
  tick(realDt) {
    if (this.status !== "running" || this.awaiting) return;
    let dt = Math.min(realDt, 0.1); // batasi lonjakan saat tab di-background
    let guard = 0;
    while (dt > EPS && this.status === "running" && !this.awaiting && guard++ < 20) dt = this.step(dt);
  }

  step(dt) {
    if (!this.unit) {
      if (this.nextUnit > this.wo.target_qty) return 0;
      this.spawn();
    }
    const u = this.unit;
    if (u.stage === 3) { this.finishUnit(); return 0; } // mengulang kirim jika sebelumnya gagal
    if (this.downtime && STATIONS[u.stage] === "assembly") return 0; // station down: unit berhenti
    if (!u.started) {
      u.started = true;
      this.stations[STATIONS[u.stage]] = "running";
      this.emit("change");
    }
    const use = Math.min(dt, DURATION[u.stage] - u.elapsed);
    u.elapsed += use;
    u.cycle += use; // cycle time = waktu kerja efektif (tanpa pause dan downtime)
    if (u.elapsed >= DURATION[u.stage] - EPS) this.finishStage();
    return dt - use;
  }

  spawn() {
    const no = this.nextUnit;
    const wheels = this.forceNG || this.ngUnits.has(no) ? 3 : 4; // unit NG: hanya 3 roda terpasang
    this.forceNG = false;
    this.unit = { no, wheels, stage: 0, elapsed: 0, cycle: 0, started: false };
    this.emit("change");
  }

  finishStage() {
    const u = this.unit;
    this.stations[STATIONS[u.stage]] = "idle";
    u.stage++;
    u.elapsed = 0;
    u.started = false;
    this.emit("change");
    if (u.stage === 3) this.finishUnit();
  }

  finishUnit() {
    if (this.awaiting) return;
    const u = this.unit;
    this.awaiting = true;
    api
      .finishUnit({ work_order_id: this.wo.id, unit_no: u.no, wheels_installed: u.wheels, cycle_seconds: Math.round(u.cycle * 100) / 100 })
      .then((res) => {
        this.emit("finished", { unitNo: u.no, status: res.status }); // scene memindahkan unit ke Finished / Reject
        this.unit = null;
        this.nextUnit = u.no + 1;
        this.awaiting = false;
        if (res.work_order_status === "Completed") this.status = "completed";
        this.emit("change");
      })
      .catch((e) => this.fail(e));
  }
}
