-- 4 tabel utama MES versi sederhana
CREATE TABLE IF NOT EXISTS work_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  target_qty   INTEGER NOT NULL CHECK (target_qty > 0),
  ng_rate      REAL NOT NULL,                 -- persentase NG yang diinput (0-100)
  ng_units     TEXT NOT NULL,                 -- daftar nomor unit yang NG, format JSON, contoh [4,11,17]
  status       TEXT NOT NULL DEFAULT 'Running',  -- Running | Completed | Stopped
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id    INTEGER NOT NULL REFERENCES work_orders(id),
  unit_no          INTEGER NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('OK', 'NG')),
  reason           TEXT,                      -- alasan NG, contoh: Missing wheel
  wheels_installed INTEGER NOT NULL,
  cycle_seconds    REAL NOT NULL,
  finished_at      TEXT NOT NULL,
  UNIQUE (work_order_id, unit_no)             -- satu unit hanya satu hasil
);

CREATE TABLE IF NOT EXISTS downtime_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id    INTEGER NOT NULL REFERENCES work_orders(id),
  station          TEXT NOT NULL,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,                      -- kosong selama downtime masih berjalan
  duration_seconds REAL
);

CREATE TABLE IF NOT EXISTS event_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER REFERENCES work_orders(id),
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
