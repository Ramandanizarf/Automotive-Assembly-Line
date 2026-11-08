import * as THREE from "three";
import { api } from "./api.js";
import { Engine } from "./engine.js";
import { Scene3D } from "./scene.js";
import { Dashboard } from "./dashboard.js";

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const scene = new Scene3D($("stage"), engine);
const dash = new Dashboard(engine);

// ===== Theme toggle =====
(function initTheme() {
  const btn = $("theme-toggle");
  const saved = localStorage.getItem("mes-theme") || "dark";
  const applyTheme = (isLight) => {
    document.body.classList.toggle("light", isLight);
    btn.textContent = isLight ? "☀️ Light" : "🌙 Dark";
    scene.setTheme(isLight);
  };
  applyTheme(saved === "light");
  btn.onclick = () => {
    const isLight = !document.body.classList.contains("light");
    applyTheme(isLight);
    localStorage.setItem("mes-theme", isLight ? "light" : "dark");
  };
})();

function showError(msg, details) {
  $("banner").textContent = details?.length ? `${msg}: ${details.join("; ")}` : msg;
  $("banner").hidden = false;
}
const clearError = () => ($("banner").hidden = true);
engine.addEventListener("error", (e) => showError("Terjadi masalah dengan backend, simulasi dijeda", [e.detail]));

// ---------- tombol aktif / nonaktif mengikuti status ----------
function syncButtons() {
  const s = engine.status;
  $("btn-start").disabled = s !== "ready";
  $("btn-pause").disabled = !(s === "running" || s === "paused") || engine.downtime;
  $("btn-pause").textContent = s === "paused" ? "Resume" : "Pause";
  $("btn-reset").disabled = !engine.wo;
  $("btn-down").disabled = !(s === "running" && !engine.downtime);
  $("btn-recover").disabled = !engine.downtime;
  $("btn-ng").disabled = !(s === "ready" || s === "running" || s === "paused");
  $("btn-ng").textContent = engine.forceNG ? "Force NG: aktif" : "Force NG (unit berikutnya)";
}
engine.addEventListener("change", syncButtons);

$("btn-start").onclick = () => { clearError(); engine.start(); };
$("btn-pause").onclick = () => (engine.status === "paused" ? engine.resume() : engine.pause());
$("btn-down").onclick = () => engine.triggerDowntime();
$("btn-recover").onclick = () => engine.recover();
$("btn-ng").onclick = () => { engine.forceNG = true; syncButtons(); };

// ---------- buat work order ----------
async function createWorkOrder(targetQty, ngRate) {
  const data = await api.createWorkOrder({ target_qty: targetQty, ng_rate: ngRate });
  engine.load(data);
}

$("wo-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearError();
  try {
    await createWorkOrder($("in-target").value, $("in-ngrate").value);
  } catch (err) {
    showError(err.message, err.details);
  }
});

// Reset: work order lama dihentikan (data TETAP tersimpan), lalu work order baru dibuat dengan pengaturan yang sama
$("btn-reset").onclick = async () => {
  if (!engine.wo) return;
  if (!confirm("Simulasi dihentikan (data tetap tersimpan) dan work order baru dibuat dengan pengaturan yang sama. Lanjut?")) return;
  clearError();
  try {
    const { id, target_qty, ng_rate } = engine.wo;
    await api.reset(id);
    await createWorkOrder(target_qty, ng_rate);
  } catch (err) {
    showError(err.message, err.details);
  }
};

// ---------- boot: lanjutkan work order terakhir bila masih berjalan ----------
async function boot() {
  try {
    const latest = await api.dashboard();
    if (latest) {
      $("in-target").value = latest.work_order.target_qty;
      $("in-ngrate").value = latest.work_order.ng_rate;
      engine.load(latest); // Running -> ready (tekan Start untuk melanjutkan); Completed/Stopped -> tampil saja
    }
  } catch (err) {
    showError("Backend tidak dapat dihubungi. Pastikan Flask berjalan di port 5000", [err.message]);
  }
  syncButtons();
}

const clock = new THREE.Clock();
function loop() {
  const dt = clock.getDelta();
  engine.tick(dt);
  scene.update(dt);
  scene.render();
  requestAnimationFrame(loop);
}

// ===== Perbesar area simulasi di dalam grid dashboard (bukan popup) =====
(function initExpand() {
  const layout = document.querySelector(".layout");
  const btn = $("btn-expand");
  if (!layout || !btn) return;

  btn.type = "button";
  btn.setAttribute("aria-controls", "stage");
  btn.setAttribute("aria-expanded", "false");

  btn.onclick = () => {
    const expanded = layout.classList.toggle("expanded-simulation");
    btn.innerHTML = expanded ? "⊡ <span>Perkecil</span>" : "⛶ <span>Perbesar</span>";
    btn.setAttribute("aria-expanded", String(expanded));
    btn.setAttribute("aria-label", expanded ? "Perkecil area simulasi" : "Perbesar area simulasi");
    btn.title = expanded ? "Kembalikan ukuran simulasi" : "Perbesar area simulasi";

    // Resize Three.js renderer after the grid has recalculated its columns.
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  };
})();

boot();
loop();
