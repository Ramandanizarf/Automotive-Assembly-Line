// Dashboard: KPI dan event log dibaca dari BACKEND (polling). Status station dibaca dari engine.
import { api } from "./api.js";
import { STATIONS } from "./engine.js";

const $ = (id) => document.getElementById(id);
const pct = (v) => (v == null ? "N/A" : (v * 100).toFixed(1) + "%");
const sec = (v) => (v == null ? "N/A" : v.toFixed(1) + " s");
const clockOf = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour12: false });

// Kartu KPI downtime tambahan (dibuat dari JS, index.html tidak perlu diubah)
const DOWNTIME_KPIS = [
  ["kpi-dt-count", "Downtime count", "0", "Kejadian gangguan"],
  ["kpi-mttr", "MTTR", "N/A", "Rata-rata waktu pemulihan"],
  ["kpi-availability", "Availability", "N/A", "Waktu mesin aktif"],
];

export class Dashboard {
  constructor(engine) {
    this.engine = engine;
    this.busy = false;
    this.allEvents = [];
    this.eventFilter = "all";
    this.filterBar = null;
    this.banner = null;
    this.bannerText = null;

    this.ensureDowntimeKpis();
    this.ensureDowntimeBanner();

    engine.addEventListener("change", () => this.renderLive());
    engine.addEventListener("finished", () => this.refresh()); // update segera setelah unit selesai
    engine.addEventListener("loaded", () => this.refresh());
    setInterval(() => this.refresh(), 1500);
    setInterval(() => this.renderBanner(), 250); // hitung mundur pemulihan
    this.renderLive();
  }

  renderLive() {
    const e = this.engine;
    let label = "BELUM ADA WO";
    if (e.wo) label = e.downtime ? "DOWN" : e.status === "ready" ? "READY" : e.status === "idle" ? "STOPPED" : e.status.toUpperCase();
    const badge = $("run-status");
    badge.textContent = label;
    badge.className = "badge status-" + label.toLowerCase().replace(/ /g, "-");
    $("run-code").textContent = e.wo ? `${e.wo.code} · ${e.wo.product_name}` : "Belum ada work order";
    for (const key of STATIONS) {
      const card = document.querySelector(`[data-station="${key}"]`);
      const st = e.stations[key];
      card.className = "station " + st;
      card.querySelector(".st-status").textContent = st.charAt(0).toUpperCase() + st.slice(1);
    }
    this.renderBanner();
  }

  async refresh() {
    const e = this.engine;
    if (!e.wo || this.busy) return;
    this.busy = true;
    try {
      const [d, ev] = await Promise.all([api.dashboard(e.wo.id), api.events(e.wo.id, 100)]);
      if (d) this.renderSummary(d);
      this.renderEvents(ev);
    } catch (err) {
      console.error(err);
    } finally {
      this.busy = false;
    }
  }

  renderSummary(d) {
    $("wo-title").textContent = `${d.work_order.code} · Output ${d.output} / ${d.work_order.target_qty}`;
    $("progress-bar").style.width = (d.progress * 100).toFixed(0) + "%";
    $("kpi-ok").textContent = d.good;
    $("kpi-ng").textContent = d.defect;
    $("kpi-quality").textContent = pct(d.quality_rate);
    $("kpi-cycle").textContent = sec(d.avg_cycle_seconds);
    $("kpi-downtime").textContent = sec(d.downtime_seconds);
    $("kpi-oee").textContent = pct(d.oee);
    const availability = $("kpi-availability");
    if (availability) availability.textContent = pct(d.availability);
    for (const key of STATIONS) {
      document.querySelector(`[data-station="${key}"] .st-down`).textContent = sec(d.downtime_by_station[key] || 0);
    }
  }

  // ---------- KPI downtime ----------
  ensureDowntimeKpis() {
    const grid = document.querySelector(".kpis");
    if (!grid || grid.querySelector("#kpi-dt-count")) return;
    for (const [id, label, initial, note] of DOWNTIME_KPIS) {
      const card = document.createElement("div");
      card.className = "kpi";
      const title = document.createElement("span");
      title.textContent = label;
      const value = document.createElement("b");
      value.id = id;
      value.textContent = initial;
      const small = document.createElement("small");
      small.textContent = note;
      card.append(title, value, small);
      grid.appendChild(card);
    }
  }

  // Count dan MTTR dihitung dari event log (maks. 100 event terakhir dari backend).
  // MTTR hanya memakai downtime yang sudah berakhir.
  downtimeStats(items) {
    let count = 0;
    let total = 0;
    let finished = 0;
    for (const ev of items) {
      if (/downtime dimulai/i.test(ev.message)) count++;
      const m = /berakhir \(([\d.]+) s\)/i.exec(ev.message);
      if (m) {
        total += parseFloat(m[1]);
        finished++;
      }
    }
    return { count, mttr: finished ? total / finished : null };
  }

  renderDowntimeKpis(items) {
    const { count, mttr } = this.downtimeStats(items);
    const countEl = $("kpi-dt-count");
    const mttrEl = $("kpi-mttr");
    if (countEl) countEl.textContent = String(count);
    if (mttrEl) mttrEl.textContent = sec(mttr);
  }

  // ---------- banner peringatan downtime + hitung mundur ----------
  ensureDowntimeBanner() {
    if (this.banner) return;
    const el = document.createElement("div");
    el.setAttribute("role", "alert");
    el.style.cssText =
      "display:none;margin-bottom:16px;padding:12px 16px;border-radius:8px;" +
      "border:1px solid color-mix(in srgb, var(--ng) 40%, transparent);" +
      "background:color-mix(in srgb, var(--ng) 12%, transparent);" +
      "color:var(--ng);font-size:13px;font-weight:600;";
    const text = document.createElement("span");
    el.appendChild(text);

    const anchor = document.querySelector(".work-order-summary");
    if (anchor) anchor.after(el);
    else document.querySelector(".kpi-section")?.before(el);

    this.banner = el;
    this.bannerText = text;
  }

  renderBanner() {
    if (!this.banner) return;
    const e = this.engine;
    const active = Boolean(e.wo && e.downtime);
    this.banner.style.display = active ? "block" : "none";
    if (!active) return;

    let text = "Gangguan di Wheel Assembly. ";
    if (e.downtimeSource === "auto") {
      const remaining = Math.max(0, e.autoRemaining || 0);
      text += `Pulih otomatis dalam ${remaining.toFixed(1)} s.`;
    } else {
      text += "Menunggu tombol Recover.";
    }
    this.bannerText.textContent = text;
  }

  // ---------- event log + filter ----------
  renderEvents(items) {
    this.allEvents = items || [];
    this.renderDowntimeKpis(this.allEvents);
    this.ensureEventFilter();
    this.drawEvents(this.filterEvents(this.allEvents));
  }

  filterEvents(items) {
    const f = this.eventFilter;
    if (f === "all") return items;
    const tests = {
      ok: /inspeksi: OK/i,
      ng: /inspeksi: NG/i,
      downtime: /downtime/i,
    };
    return items.filter((e) => tests[f].test(e.message));
  }

  ensureEventFilter() {
    if (this.filterBar) return;
    const frame = $("event-log").closest(".table-frame");
    if (!frame) return;

    const bar = document.createElement("div");
    bar.className = "event-filter";
    const options = [
      ["all", "Semua"],
      ["ok", "OK"],
      ["ng", "NG"],
      ["downtime", "Downtime"],
    ];
    for (const [value, label] of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "button button--compact button--quiet";
      b.textContent = label;
      b.dataset.filter = value;
      b.addEventListener("click", () => this.setEventFilter(value));
      bar.appendChild(b);
    }
    frame.before(bar);
    this.filterBar = bar;
    this.updateFilterButtons();
  }

  setEventFilter(value) {
    this.eventFilter = value;
    this.updateFilterButtons();
    this.drawEvents(this.filterEvents(this.allEvents));
  }

  updateFilterButtons() {
    if (!this.filterBar) return;
    for (const b of this.filterBar.children) {
      b.setAttribute("aria-pressed", String(b.dataset.filter === this.eventFilter));
    }
  }

  drawEvents(items) {
    if (!items?.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent =
        this.allEvents.length && this.eventFilter !== "all"
          ? "Tidak ada event untuk filter ini."
          : "Belum ada aktivitas untuk work order ini.";
      row.appendChild(cell);
      $("event-log").replaceChildren(row);
      return;
    }
    $("event-log").replaceChildren(
      ...items.map((e) => {
        const row = document.createElement("tr");
        if (/downtime/i.test(e.message)) {
          row.classList.add("event-downtime");
          if (/berakhir/i.test(e.message)) row.classList.add("event-recovered");
        }
        for (const text of [clockOf(e.created_at), e.message]) {
          const td = document.createElement("td");
          td.textContent = text; // textContent, bukan innerHTML
          row.appendChild(td);
        }
        return row;
      })
    );
  }
}