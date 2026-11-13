import { api } from "./api.js";

// ==================================================
// SMART AUTOMOTIVE ASSEMBLY LINE - SIMULATION ENGINE
// ==================================================

export const STATIONS = [
  "loading",
  "assembly",
  "inspection"
];

export const DURATION = [2, 3, 2];

const EPS = 1e-9;

// ==================================================
// AUTOMATIC DOWNTIME CONFIGURATION
// ==================================================

export const AUTO_DOWNTIME = {
  intervalRange: [20, 40],
  durationRange: [3, 8]
};

const randomBetween = ([min, max]) => {
  return min + Math.random() * (max - min);
};

// ==================================================
// ENGINE
// ==================================================

export class Engine extends EventTarget {

  constructor({
    autoDowntime = true,
    autoIntervalSeconds = null,
    autoDurationSeconds = null
  } = {}) {

    super();

    this.autoDowntime = autoDowntime;
    this.autoIntervalSeconds = autoIntervalSeconds;
    this.autoDurationSeconds = autoDurationSeconds;

    // Simulation speed multiplier
    this.speed = 1;

    this.forceNG = false;

    this.clear();
  }

  // SIMULATION SPEED CONTROL
  setSpeed(value) {
    const speed = Number(value);

    if (!Number.isFinite(speed)) return;

    this.speed = Math.min(3, Math.max(0.5, speed));

    this.emit("change");
  }

  // ==================================================
  // RESET ENGINE STATE
  // ==================================================

  clear() {

    this.wo = null;
    this.ngUnits = new Set();

    this.status = "idle";

    this.stations = {
      loading: "idle",
      assembly: "idle",
      inspection: "idle"
    };

    this.unit = null;
    this.nextUnit = 1;
    this.awaiting = false;

    this.downtime = false;
    this.downtimeSource = null;
    this.downtimePending = false;

    this.autoElapsed = 0;
    this.autoRemaining = 0;

    this.nextAutoInterval =
      this.autoIntervalSeconds ??
      randomBetween(AUTO_DOWNTIME.intervalRange);

    this.generation = (this.generation || 0) + 1;
  }

  // ==================================================
  // EVENT HANDLER
  // ==================================================

  emit(name, detail) {

    this.dispatchEvent(
      new CustomEvent(name, { detail })
    );
  }

  // ==================================================
  // LOAD WORK ORDER
  // ==================================================

  load(dash) {

    this.clear();

    if (dash) {

      this.wo = dash.work_order;

      this.ngUnits = new Set(
        dash.work_order.ng_units
      );

      this.nextUnit = dash.next_unit_no;

      const s = this.wo.status;

      this.status =
        s === "Completed"
          ? "completed"
          : s === "Running"
            ? "ready"
            : "idle";

      if (
        this.status === "ready" &&
        dash.active_downtime
      ) {

        api.downtimeEnd(this.wo.id)
          .catch(() => {});
      }
    }

    this.emit("loaded");
    this.emit("change");
  }

  // ==================================================
  // START / PAUSE / RESUME
  // ==================================================

  start() {

    if (this.status !== "ready") return;

    this.status = "running";

    this.emit("change");
  }

  pause() {

    if (
      this.status !== "running" ||
      this.downtime
    ) {
      return;
    }

    this.status = "paused";

    this.emit("change");
  }

  resume() {

    if (this.status !== "paused") return;

    this.status = "running";

    this.emit("change");
  }

  // ==================================================
  // TRIGGER DOWNTIME
  // MANUAL / AUTOMATIC
  // ==================================================

  triggerDowntime(source = "manual") {

    if (
      this.status !== "running" ||
      this.downtime ||
      this.downtimePending
    ) {
      return false;
    }

    this.downtime = true;
    this.downtimeSource = source;

    // Random duration for automatic downtime
    this.autoRemaining =
      source === "auto"
        ? (
            this.autoDurationSeconds ??
            randomBetween(
              AUTO_DOWNTIME.durationRange
            )
          )
        : 0;

    this.downtimePending = true;

    // Only Wheel Assembly goes DOWN
    this.stations.assembly = "down";

    this.emit("change");

    const generation = this.generation;

    api.downtimeStart(
      this.wo.id,
      "assembly"
    )

      .then(() => {

        if (
          generation !== this.generation
        ) {
          return;
        }

        this.downtimePending = false;

        this.emit("change");
      })

      .catch((error) => {

        if (
          generation !== this.generation
        ) {
          return;
        }

        this.downtime = false;
        this.downtimeSource = null;
        this.downtimePending = false;

        this.stations.assembly =
          this.unit?.stage === 1
            ? "running"
            : "idle";

        this.fail(error);
      });

    return true;
  }

  // ==================================================
  // RECOVER DOWNTIME
  // ==================================================

  recover() {

    if (
      !this.downtime ||
      this.downtimePending
    ) {
      return false;
    }

    this.downtimePending = true;

    this.emit("change");

    const generation = this.generation;

    api.downtimeEnd(this.wo.id)

      .then(() => {

        if (
          generation !== this.generation
        ) {
          return;
        }

        this.downtime = false;
        this.downtimeSource = null;
        this.downtimePending = false;

        this.autoElapsed = 0;
        this.autoRemaining = 0;

        // Generate a new random downtime interval
        this.nextAutoInterval =
          this.autoIntervalSeconds ??
          randomBetween(
            AUTO_DOWNTIME.intervalRange
          );

        this.stations.assembly =
          this.unit?.stage === 1
            ? "running"
            : "idle";

        this.emit("change");
      })

      .catch((error) => {

        if (
          generation !== this.generation
        ) {
          return;
        }

        this.downtimePending = false;

        this.fail(error);
      });

    return true;
  }

  // ==================================================
  // ERROR HANDLER
  // ==================================================

  fail(error) {

    if (this.status === "running") {
      this.status = "paused";
    }

    this.awaiting = false;

    this.emit(
      "error",
      error.message || String(error)
    );

    this.emit("change");
  }

  // ==================================================
  // MAIN SIMULATION LOOP
  // ==================================================

  tick(realDt) {

    if (
      this.status !== "running" ||
      this.awaiting
    ) {
      return;
    }

    // Apply simulation speed multiplier
    let dt = Math.min(realDt, 0.1) * this.speed;

    // ================================================
    // ACTIVE DOWNTIME
    // ================================================

    if (this.downtime) {

      if (
        this.downtimeSource === "auto" &&
        !this.downtimePending
      ) {

        this.autoRemaining -= dt;

        // Automatic recovery
        if (this.autoRemaining <= 0) {

          this.recover();
        }
      }

      // Stop unit at Wheel Assembly
      if (this.unit?.stage === 1) {
        return;
      }
    }

    // ================================================
    // AUTOMATIC RANDOM DOWNTIME
    // ================================================

    if (
      this.autoDowntime &&
      !this.downtime &&
      !this.downtimePending
    ) {

      this.autoElapsed += dt;

      // Trigger only at Wheel Assembly
      if (
        this.autoElapsed >=
          this.nextAutoInterval &&
        this.unit?.stage === 1
      ) {

        this.triggerDowntime("auto");

        return;
      }
    }

    // ================================================
    // NORMAL PRODUCTION PROCESS
    // ================================================

    let guard = 0;

    while (
      dt > EPS &&
      this.status === "running" &&
      !this.awaiting &&
      guard++ < 20
    ) {

      dt = this.step(dt);
    }
  }

  // ==================================================
  // PROCESS EACH STATION
  // ==================================================

  step(dt) {

    if (!this.unit) {

      if (
        this.nextUnit >
        this.wo.target_qty
      ) {
        return 0;
      }

      this.spawn();
    }

    const u = this.unit;

    if (u.stage === 3) {

      this.finishUnit();

      return 0;
    }

    // Wheel Assembly stops during downtime
    if (
      this.downtime &&
      STATIONS[u.stage] === "assembly"
    ) {
      return 0;
    }

    if (!u.started) {

      u.started = true;

      this.stations[
        STATIONS[u.stage]
      ] = "running";

      this.emit("change");
    }

    const use = Math.min(
      dt,
      DURATION[u.stage] - u.elapsed
    );

    u.elapsed += use;
    u.cycle += use;

    if (
      u.elapsed >=
      DURATION[u.stage] - EPS
    ) {

      this.finishStage();
    }

    return dt - use;
  }

  // ==================================================
  // SPAWN NEW UNIT
  // ==================================================

  spawn() {

    const no = this.nextUnit;

    const wheels =
      this.forceNG ||
      this.ngUnits.has(no)
        ? 3
        : 4;

    this.forceNG = false;

    this.unit = {
      no,
      wheels,
      stage: 0,
      elapsed: 0,
      cycle: 0,
      started: false
    };

    this.emit("change");
  }

  // ==================================================
  // FINISH STATION
  // ==================================================

  finishStage() {

    const u = this.unit;

    this.stations[
      STATIONS[u.stage]
    ] = "idle";

    u.stage++;

    u.elapsed = 0;
    u.started = false;

    this.emit("change");

    if (u.stage === 3) {

      this.finishUnit();
    }
  }

  // ==================================================
  // FINISH PRODUCTION UNIT
  // ==================================================

  finishUnit() {

    if (this.awaiting) return;

    const u = this.unit;

    this.awaiting = true;

    api.finishUnit({

      work_order_id: this.wo.id,
      unit_no: u.no,
      wheels_installed: u.wheels,

      cycle_seconds:
        Math.round(u.cycle * 100) / 100

    })

      .then((res) => {

        this.emit("finished", {
          unitNo: u.no,
          status: res.status
        });

        this.unit = null;

        this.nextUnit = u.no + 1;

        this.awaiting = false;

        if (
          res.work_order_status ===
          "Completed"
        ) {

          this.status = "completed";
        }

        this.emit("change");
      })

      .catch((error) => {

        this.fail(error);
      });
  }
}