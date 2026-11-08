# Smart Automotive Assembly Line MES (versi sederhana)

Simulasi 3D lini perakitan mobil mini + dashboard MES. Backend Flask, database SQLite, frontend Three.js (Vite).
**Seluruh data berasal dari simulasi software, bukan mesin fisik.**

## Menjalankan

Butuh: Python 3.11+, Node.js 20+ (LTS), browser Chrome atau Edge. Buka dua terminal.

**Terminal 1: backend** (http://127.0.0.1:5000)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

**Terminal 2: frontend** (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5173, isi target dan NG rate, klik **Buat WO dan Run**, lalu **Start**.
Cek backend: http://127.0.0.1:5000/api/health

## Cara kerja singkat

1. Buat work order (target, NG rate). Backend menghitung jumlah NG = target x NG rate (dibulatkan), lalu mengacak nomor unit yang NG.
2. Start: tiap unit melewati Chassis Loading (2 s), Wheel Assembly (3 s), Quality Inspection (2 s). Unit NG hanya mendapat 3 roda.
3. Setelah inspeksi, frontend mengirim jumlah roda dan cycle time ke backend. Backend menilai: 4 roda = OK, kurang = NG (Missing wheel), lalu mencatat ke database.
4. Dashboard membaca KPI dari backend. Saat target tercapai, work order otomatis Completed.
5. Simulate Downtime menghentikan Wheel Assembly (status Down) sampai Recover ditekan. Durasinya dicatat.
6. Reset menghentikan work order aktif (data tetap tersimpan) dan membuat work order baru dengan pengaturan yang sama.
7. Refresh halaman: work order yang masih berjalan dilanjutkan dari unit berikutnya (tekan Start).

Aturan lain: pause tidak bisa saat downtime. Cycle time = waktu kerja efektif (tanpa pause dan downtime). Tombol Force NG menjadikan unit berikutnya NG (untuk demo), jadi total NG bisa lebih dari rencana.

## Pengujian

```bash
# Backend (12 tes, memakai database sementara)
cd backend
python -m unittest discover -s tests -t . -v

# Engine <-> backend tanpa browser (jalankan backend dengan database sementara dulu)
cd backend && MES_DB=/tmp/e2e.db python app.py        # PowerShell: $env:MES_DB="$env:TEMP\e2e.db"; python app.py
cd frontend && node tests/engine_e2e.mjs
```

## Struktur

```
backend/   app.py (API + aturan bisnis + KPI) · schema.sql (4 tabel) · tests/
frontend/  index.html · src/engine.js (state machine + timer) · src/scene.js (Three.js)
           src/dashboard.js · src/api.js · src/main.js · src/style.css · tests/
```

Tabel: work_orders, production_logs, downtime_logs, event_logs.
Endpoint: POST /api/work-orders · POST /api/units/finish · POST /api/downtime/start · POST /api/downtime/end · GET /api/dashboard · GET /api/events · POST /api/reset · GET /api/health

## Peta file ke rencana mingguan (acuan belajar)

| Minggu | Fokus | Bagian kode terkait |
| --- | --- | --- |
| 1 | Fondasi | `/api/health`, `schema.sql`, scene kosong (lantai, kamera) di `scene.js`, kerangka `index.html` |
| 2 | Versi statis | `POST /api/work-orders`, `GET /api/dashboard`, model station dan unit di `scene.js` (`buildFactory`, `makeUnit`), tampilan `style.css` |
| 3 | Satu siklus OK | `POST /api/units/finish`, `engine.js` (`step`, `finishStage`, `finishUnit`), animasi unit di `scene.js`, polling di `dashboard.js` |
| 4 | NG dan downtime | Jumlah NG di `create_work_order`, `downtime_*` di `app.py`, `triggerDowntime`/`recover`/`forceNG` di `engine.js`, status Completed |
| 5 | Integrasi dan tes | `tests/`, perbaikan bug, bonus OEE (`build_dashboard`) |
| 6 | Finalisasi | Dokumentasi, laporan, demo |

Catatan: OEE bersifat estimasi (ideal cycle 7 detik adalah konstanta simulasi), jadi Performance hampir selalu 100%
