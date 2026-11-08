# Smart Automotive Assembly Line MES

Dashboard **Manufacturing Execution System (MES)** sederhana untuk memvisualisasikan proses lini perakitan mobil mini. Aplikasi menggabungkan simulasi lini produksi 3D, kontrol work order, pencatatan hasil inspeksi, monitoring downtime, dan ringkasan KPI produksi.

> **Penting:** aplikasi ini merupakan simulasi berbasis software. Data dan status yang ditampilkan bukan berasal dari PLC, sensor, atau mesin produksi fisik.

## Daftar Isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Arsitektur dan cara kerja](#arsitektur-dan-cara-kerja)
- [Alur simulasi produksi](#alur-simulasi-produksi)
- [KPI dan aturan perhitungan](#kpi-dan-aturan-perhitungan)
- [Persyaratan](#persyaratan)
- [Instalasi dan menjalankan aplikasi](#instalasi-dan-menjalankan-aplikasi)
- [Kontrol dashboard](#kontrol-dashboard)
- [API backend](#api-backend)
- [Struktur folder](#struktur-folder)
- [Pengujian](#pengujian)
- [Batasan saat ini](#batasan-saat-ini)

## Fitur

- Visualisasi 3D lini perakitan menggunakan Three.js.
- Tiga workstation: **Chassis Loading**, **Wheel Assembly**, dan **Quality Inspection**.
- Pembuatan work order berdasarkan target produksi dan NG rate.
- Simulasi unit OK dan NG berdasarkan jumlah roda yang terpasang.
- Kontrol Start, Pause/Resume, Reset, Simulate Downtime, Recover, dan Force NG.
- Dashboard output, good output, defect, progress, quality rate, average cycle time, downtime, dan estimasi OEE.
- Status setiap workstation dan production event log.
- Tema dark/light.
- Tombol **Perbesar** untuk memperlebar area simulasi di dalam layout dashboard; bukan popup atau fullscreen overlay. Panel informasi lain menyesuaikan layout.
- Backend Flask dengan penyimpanan SQLite.

## Teknologi

| Bagian | Teknologi | Tanggung jawab |
|---|---|---|
| Frontend | HTML, CSS, JavaScript ES Modules | Antarmuka dan interaksi dashboard |
| 3D | Three.js | Visualisasi lini produksi dan unit |
| Frontend tooling | Vite | Development server dan build frontend |
| Backend | Python, Flask | API, validasi, aturan produksi, dan KPI |
| Database | SQLite | Penyimpanan work order, hasil produksi, downtime, dan event |

## Arsitektur dan cara kerja

Aplikasi terdiri dari frontend dan backend yang berjalan sebagai dua proses terpisah:

1. **Frontend** menampilkan dashboard, menjalankan animasi 3D, mengelola urutan simulasi melalui `Engine`, dan mengirim hasil proses ke backend melalui `api.js`.
2. **Engine (`engine.js`)** mengatur state simulasi, timer tahapan proses, unit yang sedang diproses, pause, downtime, dan penyelesaian unit.
3. **Scene (`scene.js`)** membangun dan merender lingkungan lini produksi menggunakan Three.js. File ini menangani visualisasi, bukan penyimpanan data produksi.
4. **Dashboard (`dashboard.js`)** memperbarui KPI, status workstation, informasi work order, progress, dan event log berdasarkan data backend serta state simulasi.
5. **API client (`api.js`)** menjadi penghubung frontend dengan endpoint Flask.
6. **Backend (`backend/app.py`)** memvalidasi input, menentukan hasil OK/NG, menghitung ringkasan dashboard, dan menyimpan catatan ke SQLite.
7. **Database (`backend/mes.db`)** dibuat/dikelola oleh backend berdasarkan skema pada `backend/schema.sql`. File database lokal tidak perlu diunggah ke GitHub.

Alur komunikasi secara ringkas:

```text
Pengguna
   |
   v
Dashboard (HTML/CSS/JS) -----> Three.js Scene
   |
   v
Engine / API Client
   |
   | HTTP request ke /api/*
   v
Flask Backend
   |
   +---- Validasi dan aturan bisnis
   |
   v
SQLite Database
   |
   v
Dashboard API response / KPI / Event Log
```

## Alur simulasi produksi

1. Pengguna mengisi **Target produksi** dan **NG rate**, lalu menekan **Buat WO dan Run**.
2. Frontend mengirim data ke `POST /api/work-orders`.
3. Backend memvalidasi target (1–100 unit) dan NG rate (0–100%). Jumlah unit NG dihitung dengan rumus `target × NG rate / 100`, dibulatkan ke bilangan bulat terdekat (nilai 0,5 dibulatkan naik). Nomor unit yang direncanakan NG dipilih secara acak.
4. Setelah work order dibuat, pengguna menekan **Start** untuk memulai simulasi.
5. Setiap unit melewati tiga tahap dengan durasi simulasi tetap:
   - Chassis Loading: 2 detik.
   - Wheel Assembly: 3 detik.
   - Quality Inspection: 2 detik.
6. Setelah inspeksi, frontend mengirim nomor unit, jumlah roda, dan cycle time ke `POST /api/units/finish`.
7. Backend menetapkan hasil **OK** jika empat roda terpasang. Jika jumlah roda kurang dari empat, hasilnya **NG** dengan alasan `Missing wheel`.
8. Hasil unit dan event dicatat ke database. Dashboard mengambil ringkasan terbaru dari API.
9. Ketika jumlah unit yang selesai mencapai target work order, status work order berubah menjadi **Completed**.

### Simulasi downtime

- **Simulate Downtime** memulai downtime pada workstation Wheel Assembly.
- Selama downtime, proses assembly tertahan sampai pengguna menekan **Recover**.
- Waktu downtime dicatat dan ditampilkan pada KPI serta ringkasan workstation.
- Pause tidak dapat digunakan ketika downtime sedang aktif.

### Force NG

Tombol **Force NG** menandai unit berikutnya sebagai unit NG untuk kebutuhan demonstrasi. Karena itu, hasil NG aktual dapat berbeda dari rencana NG yang dihitung ketika work order dibuat.

### Reset dan pemulihan sesi

- **Reset** menghentikan work order berjalan dan tidak menghapus riwayat yang sudah tersimpan. Frontend kemudian membuat work order baru menggunakan target dan NG rate yang sama.
- Jika halaman direfresh ketika work order masih berjalan, frontend memuat work order terbaru dan menyiapkan simulasi untuk dilanjutkan dari unit berikutnya. Tekan **Start** untuk melanjutkan.

## KPI dan aturan perhitungan

| Indikator | Makna |
|---|---|
| Output | Jumlah unit yang sudah menyelesaikan inspeksi |
| Good output | Jumlah unit dengan status OK |
| Defect / NG | Jumlah unit dengan status NG |
| Progress | Output dibagi target work order, maksimum 100% |
| Quality rate | Good output dibagi total output |
| Average cycle time | Total cycle time tercatat dibagi jumlah unit selesai |
| Total downtime | Akumulasi durasi downtime pada work order |
| OEE | Estimasi gabungan Availability × Performance × Quality |

**Catatan OEE:** nilai OEE pada aplikasi merupakan estimasi untuk kebutuhan simulasi, bukan pengukuran standar pabrik dari mesin nyata. Ideal cycle yang digunakan adalah konstanta simulasi 7 detik. Karena itu, nilai Performance dapat mendekati 100% dan hasil OEE tidak boleh dianggap sebagai data operasional industri.

## Persyaratan

- Python 3.11 atau lebih baru.
- Node.js 20 LTS atau lebih baru (npm disertakan).
- Browser modern, disarankan Google Chrome atau Microsoft Edge.
- Dua terminal untuk menjalankan backend dan frontend.

## Instalasi dan menjalankan aplikasi

Clone repository:

```bash
git clone https://github.com/USERNAME/NAMA-REPOSITORY.git
cd NAMA-REPOSITORY
```

Ganti URL dan nama folder sesuai repository GitHub milikmu.

### 1. Jalankan backend Flask

Buka terminal pertama dari folder utama project:

```bash
cd backend
python -m venv .venv
```

Aktifkan virtual environment.

**Windows PowerShell:**

```powershell
.venv\Scripts\Activate.ps1
```

**Windows Command Prompt:**

```bat
.venv\Scripts\activate.bat
```

**macOS / Linux:**

```bash
source .venv/bin/activate
```

Install dependency dan jalankan Flask:

```bash
pip install -r requirements.txt
python app.py
```

Backend berjalan di `http://127.0.0.1:5000`.

Cek status backend melalui `http://127.0.0.1:5000/api/health`. Respons normal menunjukkan status `up`.

### 2. Jalankan frontend Vite

Buka terminal kedua dari folder utama project:

```bash
cd frontend
npm install
npm run dev
```

Vite biasanya berjalan di `http://localhost:5173`. Buka alamat yang ditampilkan pada terminal.

### 3. Mulai simulasi

1. Pastikan backend dan frontend sama-sama berjalan.
2. Buka dashboard pada browser.
3. Masukkan target produksi dan NG rate.
4. Klik **Buat WO dan Run**.
5. Klik **Start** untuk menjalankan lini perakitan 3D.

## Kontrol dashboard

| Kontrol | Fungsi |
|---|---|
| Buat WO dan Run | Membuat work order baru sesuai target dan NG rate |
| Start | Memulai atau melanjutkan simulasi yang siap berjalan |
| Pause / Resume | Menjeda atau melanjutkan simulasi |
| Reset | Menghentikan work order aktif dan membuat work order baru dengan pengaturan yang sama |
| Simulate Downtime | Mensimulasikan gangguan pada Wheel Assembly |
| Recover | Mengakhiri downtime aktif |
| Force NG | Memaksa unit berikutnya menjadi NG untuk demonstrasi |
| Perbesar / Perkecil | Mengubah lebar area visualisasi 3D di layout dashboard |
| Dark / Light | Mengganti tema tampilan dashboard |

## API backend

Semua endpoint menggunakan prefix `/api` dan mengembalikan respons JSON.

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/health` | Memeriksa status backend |
| `POST` | `/api/work-orders` | Membuat work order baru |
| `POST` | `/api/units/finish` | Mencatat hasil inspeksi unit |
| `POST` | `/api/downtime/start` | Memulai downtime |
| `POST` | `/api/downtime/end` | Mengakhiri downtime aktif |
| `GET` | `/api/dashboard` | Mengambil ringkasan work order terbaru atau berdasarkan ID |
| `GET` | `/api/events` | Mengambil event log work order |
| `POST` | `/api/reset` | Menghentikan work order aktif tanpa menghapus riwayat |

Contoh membuat work order:

```http
POST /api/work-orders
Content-Type: application/json

{
  "target_qty": 20,
  "ng_rate": 15
}
```

Contoh mencatat unit selesai:

```http
POST /api/units/finish
Content-Type: application/json

{
  "work_order_id": 1,
  "unit_no": 1,
  "wheels_installed": 4,
  "cycle_seconds": 7
}
```

Untuk detail validasi dan format respons, lihat implementasi endpoint pada `backend/app.py`.

## Struktur folder

```text
MES/
├── backend/
│   ├── app.py                 # Flask API, aturan bisnis, perhitungan KPI
│   ├── schema.sql             # Struktur tabel SQLite
│   ├── requirements.txt       # Dependency Python
│   └── tests/                 # Pengujian backend
├── frontend/
│   ├── index.html             # Struktur halaman dashboard
│   ├── package.json           # Dependency dan perintah Vite
│   ├── vite.config.js          # Konfigurasi Vite
│   ├── src/
│   │   ├── main.js            # Inisialisasi aplikasi dan event kontrol
│   │   ├── style.css          # Styling, tema, dan layout dashboard
│   │   ├── dashboard.js       # Render KPI, workstation, dan event log
│   │   ├── engine.js          # State machine dan alur simulasi
│   │   ├── scene.js           # Scene dan rendering Three.js
│   │   └── api.js             # HTTP client ke backend
│   └── tests/                 # Pengujian integrasi engine
├── DESIGN.md                  # Arah visual dan panduan desain UI
├── AGENTS.md                  # Panduan kerja coding agent
├── .gitignore                 # File/folder yang tidak dilacak Git
└── README.md                  # Dokumentasi project
```

## Pengujian

### Backend

Dari folder utama project:

```bash
cd backend
python -m unittest discover -s tests -t . -v
```

Test backend menggunakan database sementara agar tidak mengubah database kerja.

### Integrasi engine dengan backend

Jalankan backend dengan database sementara pada terminal pertama.

**macOS / Linux:**

```bash
cd backend
MES_DB=/tmp/mes-e2e.db python app.py
```

**Windows PowerShell:**

```powershell
cd backend
$env:MES_DB="$env:TEMP\mes-e2e.db"
python app.py
```

Kemudian jalankan test dari terminal kedua:

```bash
cd frontend
node tests/engine_e2e.mjs
```

### Build frontend

```bash
cd frontend
npm install
npm run build
```

Hasil build produksi akan dibuat pada `frontend/dist/`. Untuk melihat hasil build secara lokal:

```bash
npm run preview
```

## Batasan saat ini

- Seluruh aktivitas produksi merupakan simulasi software; belum terhubung ke mesin, PLC, sensor, SCADA, atau perangkat industri.
- Durasi tiap proses ditentukan oleh konfigurasi simulasi, bukan data aktual mesin.
- Klasifikasi kualitas saat ini sederhana: empat roda terpasang = OK; kurang dari empat = NG (`Missing wheel`).
- NG rate digunakan untuk merencanakan nomor unit NG secara acak. Tombol Force NG dapat menambah hasil NG aktual di luar rencana.
- OEE merupakan estimasi dengan asumsi ideal cycle 7 detik, bukan metrik tervalidasi untuk operasional pabrik.
- Backend pengembangan berjalan pada localhost. Untuk deployment publik diperlukan konfigurasi server, keamanan, CORS/proxy sesuai lingkungan, dan pengelolaan database yang tepat.

## Pengembangan selanjutnya

Beberapa pengembangan yang dapat dipertimbangkan:

- Integrasi data sensor/PLC melalui gateway industri.
- Manajemen pengguna dan hak akses.
- Histori dan filter work order.
- Export laporan produksi.
- Alarm dan notifikasi downtime.
- Konfigurasi cycle time per workstation.
- Perhitungan OEE berdasarkan planned production time dan standar cycle time yang tervalidasi.
- Deployment backend dan frontend ke server.

---

Dibuat sebagai project simulasi pembelajaran dan demonstrasi konsep Manufacturing Execution System.
