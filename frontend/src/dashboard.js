// Dashboard: KPI dan event log dibaca dari BACKEND (polling). Status station dibaca dari engine.
import { api } from "./api.js";
import { STATIONS } from "./engine.js";

const $ = (id) => document.getElementById(id);
const pct = (v) => (v == null ? "N/A" : (v * 100).toFixed(1) + "%");
const sec = (v) => (v == null ? "N/A" : v.toFixed(1) + " s");
const clockOf = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour12: false });

export class Dashboard {
  constructor(engine) {
    this.engine = engine;
    this.busy = false;
    this.allEvents = [];
    this.eventFilter = "all";
    this.filterBar = null;
    engine.addEventListener("change", () => this.renderLive());
    engine.addEventListener("finished", () => this.refresh()); // update segera setelah unit selesai
    engine.addEventListener("loaded", () => this.refresh());
    setInterval(() => this.refresh(), 1500);
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
    for (const key of STATIONS) {
      document.querySelector(`[data-station="${key}"] .st-down`).textContent = sec(d.downtime_by_station[key] || 0);
    }
  }

  // ---------- event log + filter ----------
  renderEvents(items) {
    this.allEvents = items || [];
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