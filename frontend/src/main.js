
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

    if (!btn) return;

    const saved = localStorage.getItem("mes-theme") || "dark";

    const applyTheme = (isLight) => {
        document.body.classList.toggle("light", isLight);

        btn.textContent = isLight ? "☀️ Light" : "🌙 Dark";

        scene.setTheme(isLight ? "light" : "dark");
    };

    applyTheme(saved === "light");

    btn.onclick = () => {
        const isLight = !document.body.classList.contains("light");

        applyTheme(isLight);

        localStorage.setItem(
            "mes-theme",
            isLight ? "light" : "dark"
        );
    };
})();

// ===== Error notification =====
function showError(msg, details) {
    $("banner").textContent =
        details && details.length
            ? `${msg}: ${details.join("; ")}`
            : msg;

    $("banner").hidden = false;
}

const clearError = () => {
    $("banner").hidden = true;
};

engine.addEventListener("error", (e) => {
    showError(
        "Terjadi masalah dengan backend, simulasi dijeda",
        [e.detail]
    );
});

// ===== Sinkronisasi tombol berdasarkan status simulasi =====
function syncButtons() {
    const s = engine.status;

    $("btn-start").disabled = s !== "ready";

    $("btn-pause").disabled =
        !(s === "running" || s === "paused") ||
        engine.downtime;

    $("btn-pause").textContent =
        s === "paused" ? "Resume" : "Pause";

    $("btn-reset").disabled = !engine.wo;

    $("btn-down").disabled = !(
        s === "running" &&
        !engine.downtime &&
        !engine.downtimePending
    );

    $("btn-recover").disabled =
        !engine.downtime ||
        engine.downtimePending;

    $("btn-ng").disabled = !(
        s === "ready" ||
        s === "running" ||
        s === "paused"
    );

    $("btn-ng").textContent = engine.forceNG
        ? "Force NG: aktif"
        : "Force NG (unit berikutnya)";
}

engine.addEventListener("change", syncButtons);

// ===== Tombol kontrol simulasi =====

$("btn-start").onclick = () => {
    clearError();
    engine.start();
};

$("btn-pause").onclick = () => {
    engine.status === "paused"
        ? engine.resume()
        : engine.pause();
};

$("btn-down").onclick = () => {
    engine.triggerDowntime();
};

$("btn-recover").onclick = () => {
    engine.recover();
};

$("btn-ng").onclick = () => {
    engine.forceNG = true;
    syncButtons();
};

// ===== Membuat Work Order =====
async function createWorkOrder(targetQty, ngRate) {
    const data = await api.createWorkOrder({
        target_qty: targetQty,
        ng_rate: ngRate
    });

    engine.load(data);
}

// ===== Form Work Order =====
$("wo-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    clearError();

    try {
        await createWorkOrder(
            $("in-target").value,
            $("in-ngrate").value
        );
    } catch (err) {
        showError(err.message, err.details);
    }
});

// ===== Reset simulasi =====
$("btn-reset").onclick = async () => {
    if (!engine.wo) return;

    const confirmed = confirm(
        "Simulasi dihentikan (data tetap tersimpan) dan work order baru dibuat dengan pengaturan yang sama. Lanjut?"
    );

    if (!confirmed) return;

    clearError();

    try {
        const { id, target_qty, ng_rate } = engine.wo;

        await api.reset(id);

        await createWorkOrder(target_qty, ng_rate);
    } catch (err) {
        showError(err.message, err.details);
    }
};

// ===== Boot: memuat Work Order terakhir =====
async function boot() {
    try {
        const latest = await api.dashboard();

        if (latest) {
            $("in-target").value =
                latest.work_order.target_qty;

            $("in-ngrate").value =
                latest.work_order.ng_rate;

            engine.load(latest);
        }
    } catch (err) {
        showError(
            "Backend tidak dapat dihubungi. Pastikan Flask berjalan di port 5000",
            [err.message]
        );
    }

    syncButtons();
}

// ===== Three.js Animation Loop =====
const clock = new THREE.Clock();

function loop() {
    const dt = clock.getDelta();

    engine.tick(dt);

    scene.update(engine, dt);

    scene.render();

    requestAnimationFrame(loop);
}

// ===== Perbesar / Perkecil area simulasi =====
(function initExpand() {
    const layout = document.querySelector(".layout");
    const btn = $("btn-expand");

    if (!layout || !btn) return;

    btn.type = "button";

    btn.setAttribute("aria-controls", "stage");

    btn.setAttribute("aria-expanded", "false");

    btn.onclick = () => {
        const expanded = layout.classList.toggle(
            "expanded-simulation"
        );

        btn.innerHTML = expanded
            ? "⊡ <span>Perkecil</span>"
            : "⛶ <span>Perbesar</span>";

        btn.setAttribute(
            "aria-expanded",
            String(expanded)
        );

        btn.setAttribute(
            "aria-label",
            expanded
                ? "Perkecil area simulasi"
                : "Perbesar area simulasi"
        );

        btn.title = expanded
            ? "Kembalikan ukuran simulasi"
            : "Perbesar area simulasi";

        // Resize renderer setelah layout berubah
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event("resize"));
        });
    };
})();

// ===== Jalankan aplikasi =====
boot();
loop();
