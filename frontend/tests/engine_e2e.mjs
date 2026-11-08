// Tes end-to-end engine <-> backend tanpa browser.
// 1) Jalankan backend dengan database SEMENTARA:   MES_DB=/tmp/e2e.db python app.py
// 2) Jalankan tes ini:                              node tests/engine_e2e.mjs   (Node 20+)
globalThis.MES_API_BASE = "http://127.0.0.1:5000";
const { Engine } = await import("../src/engine.js");
const { api } = await import("../src/api.js");

const assert = (c, m) => { if (!c) { console.error("GAGAL:", m); process.exit(1); } else console.log("ok  -", m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pump(engine, until, max = 40000) {
  for (let i = 0; i < max && !until(); i++) { engine.tick(0.1); await sleep(0); }
}

const errors = [];
const finished = [];
function newEngine() {
  const e = new Engine();
  e.addEventListener("error", (ev) => errors.push(ev.detail));
  e.addEventListener("finished", (ev) => finished.push(ev.detail));
  return e;
}

// ---- skenario 1: work order 6 unit, NG 34% (= 2 unit) ----
let dash = await api.createWorkOrder({ target_qty: 6, ng_rate: 34 });
const wo = dash.work_order;
assert(wo.ng_units.length === 2, "jumlah NG = round(6 x 34%) = 2, unit NG: " + wo.ng_units);
const engine = newEngine();
engine.load(dash);
assert(engine.status === "ready", "setelah WO dibuat, simulasi siap (ready)");
engine.start();
assert(engine.status === "running", "Start -> running");

await pump(engine, () => engine.unit && engine.unit.stage === 1 && engine.unit.started && engine.unit.elapsed > 0.5);
engine.pause();
const e0 = engine.unit.elapsed;
for (let i = 0; i < 30; i++) { engine.tick(0.1); await sleep(0); }
assert(engine.unit.elapsed === e0, "pause membekukan progres unit");
engine.resume();

await pump(engine, () => engine.unit && engine.unit.stage === 1 && engine.unit.started && engine.unit.elapsed > 0.3);
engine.triggerDowntime();
assert(engine.stations.assembly === "down", "downtime -> station assembly Down");
engine.pause();
assert(engine.status === "running", "pause ditolak saat downtime");
const frozen = engine.unit.elapsed;
for (let i = 0; i < 10; i++) { engine.tick(0.1); await sleep(0); }
assert(engine.unit.elapsed === frozen, "unit berhenti selama downtime");
await sleep(400);
engine.recover();
assert(engine.stations.assembly === "running", "Recover -> assembly running lagi");

// simulasi refresh halaman setelah 3 unit selesai: engine baru dimuat dari backend
await pump(engine, () => finished.length >= 3);
const engine2 = newEngine();
engine2.load(await api.dashboard());
assert(engine2.nextUnit === 4 && engine2.status === "ready", "setelah refresh melanjutkan dari unit 4");
engine2.start();
await pump(engine2, () => engine2.status === "completed");
assert(engine2.status === "completed", "work order Completed");

dash = await api.dashboard(wo.id);
console.log(JSON.stringify(dash));
assert(dash.output === 6 && dash.good + dash.defect === 6, "OK + NG = output = target");
assert(dash.defect === 2 && dash.good === 4, "2 NG sesuai rencana, 4 OK");
assert(finished.filter((f) => f.status === "NG").map((f) => f.unitNo).sort().join() === wo.ng_units.join(), "unit NG = unit yang dijadwalkan");
assert(Math.abs(dash.avg_cycle_seconds - 7) < 0.05, "avg cycle time 7.0 s (tanpa pause/downtime): " + dash.avg_cycle_seconds);
assert(dash.downtime_seconds > 0.3 && dash.downtime_seconds < 2, "downtime tercatat: " + dash.downtime_seconds.toFixed(2) + " s");
const ev = (await api.events(wo.id, 100)).map((e) => e.message).join("\n");
assert(/Missing wheel/.test(ev) && /Downtime dimulai/.test(ev) && /Downtime Wheel Assembly berakhir/.test(ev) && /Completed/.test(ev), "event log lengkap");

// ---- skenario 2: Force NG ----
dash = await api.createWorkOrder({ target_qty: 3, ng_rate: 0 });
const e3 = newEngine();
e3.load(dash);
e3.forceNG = true;
e3.start();
await pump(e3, () => e3.status === "completed");
dash = await api.dashboard(dash.work_order.id);
assert(dash.defect === 1 && dash.good === 2, "Force NG membuat tepat satu unit NG (unit pertama)");

// ---- skenario 3: reset ----
dash = await api.createWorkOrder({ target_qty: 5, ng_rate: 0 });
const e4 = newEngine();
e4.load(dash);
e4.start();
const base = finished.length;
await pump(e4, () => finished.length >= base + 2);
await api.reset(dash.work_order.id);
const after = await api.dashboard(dash.work_order.id);
assert(after.work_order.status === "Stopped" && after.output >= 1, "reset menghentikan WO tetapi data tetap ada");
assert(errors.length === 0, "tidak ada error engine " + JSON.stringify(errors));
console.log("SEMUA TES E2E LULUS");
