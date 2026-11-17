# SIMAMBIL - Sistem Informasi Manajemen Arsip Pemilu/Pemilihan Berbasis Mobile

Aplikasi PWA Dokumentasi Berkas Hasil Penghitungan Suara (Model C-Plano / D-Plano) berbasis **Decoupled Architecture**:
- **Frontend:** Progressive Web App (PWA) di-deploy ke **Vercel** via **GitHub**.
- **Backend:** **Google Apps Script (GAS) Headless REST API** terhubung ke Google Sheets (Data Master & Log) dan Google Drive.
- **Target Google Drive Root Folder:** [Buka Google Drive](https://drive.google.com/drive/folders/1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI?usp=sharing) (`1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`).

---

## 📁 Struktur Direktori
```text
SIMAMBIL/
├── docs/                     # 7 Dokumen Source of Truth (SOT)
│   ├── 01-PRD.md
│   ├── 02-USER-FLOW.md
│   ├── 03-UI-GUIDELINE.md
│   ├── 04-DATABASE-SPEC.md
│   ├── 05-API-SPEC.md
│   ├── 06-BUSINESS-RULES.md
│   └── 07-IMPLEMENTATION-PLAN.md
├── backend/                  # Google Apps Script REST API
│   ├── Code.gs               # API Router (doGet, doPost), Sheets & Drive Handler (Folder Target)
│   └── appsscript.json       # GAS Manifest (V8, Timezone WITA)
└── frontend/                 # PWA Frontend (Siap Deploy ke Vercel)
    ├── index.html            # Shell Antarmuka Responsif Mobile
    ├── styles.css            # Styling Tema KPU Maroon & Design System
    ├── config.js             # Konfigurasi Endpoint GAS Web App
    ├── app.js                # Logic Kamera, Kompresi Canvas, PDF Compiler, Rekap Dashboard
    ├── manifest.json         # Manifest Instalasi PWA
    ├── sw.js                 # Service Worker Caching Offline
    ├── vercel.json           # Konfigurasi Routing & CORS Vercel
    └── package.json          # Node Metadata
```

---

## 🚀 Panduan Deployment

### Langkah 1: Setup Backend (Google Apps Script)
1. Buat Google Spreadsheet baru di Google Drive (misal: `DATABASE_SIMAMBIL_KAB_GORONTALO`).
2. Buka menu **Ekstensi** > **Apps Script**.
3. Salin isi `backend/Code.gs` ke editor Apps Script.
4. Pada dropdown fungsi di toolbar atas, pilih fungsi **`setupDatabase`** lalu klik **Jalankan (Run)**.
   - Setujui izin otorisasi Google Spreadsheet dan Drive.
   - Fungsi ini akan otomatis menginisialisasi 4 sheet: `Master_Wilayah` (19 Kecamatan Kab. Gorontalo), `Master_Kategori`, `Log_Dokumen`, dan `Rekap_Progres`.
5. Klik **Deploy** > **New deployment (Penerapan baru)**.
   - Pilih jenis: **Web app**.
   - **Execute as (Jalankan sebagai):** *Me / Saya*.
   - **Who has access (Siapa yang memiliki akses):** *Anyone / Siapa saja*.
   - Klik **Deploy**, lalu **Salin URL Web App** yang dihasilkan (format: `https://script.google.com/macros/s/.../exec`).

### Langkah 2: Setup Frontend & Deploy ke Vercel
1. Buka file `frontend/config.js`, masukkan URL Web App yang disalin dari Langkah 1 ke konstanta `DEFAULT_GAS_API_URL`:
   ```javascript
   const DEFAULT_GAS_API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
   *(Catatan: URL ini juga bisa diatur/diubah kapan saja langsung melalui menu ⚙️ Pengaturan di dalam aplikasi tanpa perlu deploy ulang)*.
2. Push perubahan ke GitHub:
   ```bash
   git add .
   git commit -m "feat: set target Drive folder and SIMAMBIL official branding"
   git push -u origin main
   ```
3. Buka dashboard [Vercel](https://vercel.com):
   - Klik **Add New** > **Project**.
   - Impor repositori GitHub Anda.
   - Pada bagian **Root Directory**, pilih folder **`frontend`**.
   - Klik **Deploy**.
4. Berkas yang diunggah akan otomatis terorganisir rapi di dalam Google Drive target:
   `[1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI] / [KECAMATAN] / [DESA] / TPS [001] / [File.pdf]`.
