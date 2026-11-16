# Implementation Plan (Rencana Implementasi Decoupled)

### Struktur Proyek (Decoupled: Vercel Frontend + Google Apps Script Backend)
```text
SIMAMBIL/
├── docs/                     # 7 Dokumen Source of Truth (SOT)
├── backend/                  # Google Apps Script REST API
│   ├── Code.gs               # Headless REST API (doGet, doPost), Sheets & Drive handler
│   └── appsscript.json       # GAS Manifest (V8, Timezone, WebApp permissions)
└── frontend/                 # PWA Frontend (Siap Push ke GitHub & Deploy ke Vercel)
    ├── index.html            # Entry point HTML5 shell
    ├── vercel.json           # Konfigurasi routing & header Vercel
    ├── manifest.json         # PWA Manifest untuk instalasi Homescreen
    ├── sw.js                 # Service Worker PWA caching
    ├── styles.css            # Desain responsif mobile tema KPU Maroon
    └── app.js                # Logika PWA, kamera, kompresi canvas, PDF & REST API fetch
```

### Tahapan Pengerjaan (Milestones)

1. **Milestone 1: Backend Google Apps Script (Headless REST API)**
   - Buat `backend/Code.gs` dengan handler HTTP REST:
     - `doGet(e)`: Mendukung `?action=getMasterData` dan `?action=getMonitoringSummary`.
     - `doPost(e)`: Mendukung upload PDF Base64, penyimpanan hierarki folder Drive, dan logging ke Spreadsheet.
   - Buat fungsi seeder `setupDatabase()` untuk 4 sheet: `Master_Wilayah`, `Master_Kategori`, `Log_Dokumen`, dan `Rekap_Progres`.

2. **Milestone 2: Frontend PWA Architecture & Vercel Config**
   - Inisialisasi struktur `/frontend` lengkap dengan `vercel.json`, `manifest.json`, dan `sw.js`.
   - Setup konfigurasi environment / Base URL endpoint GAS agar fleksibel dihubungkan ke Web App URL.

3. **Milestone 3: UI Layout & Cascading Dropdown**
   - Bangun antarmuka mobile-first di `frontend/index.html` dan `frontend/styles.css`.
   - Implementasikan dropdown berjenjang (Kecamatan -> Desa -> TPS) yang mengambil data via `fetch(GAS_URL + '?action=getMasterData')`.
   - Generator nama berkas standar baku secara live.

4. **Milestone 4: Modul Kamera & Kompresi Canvas Client-Side**
   - Integrasikan kamera HTML5 (`navigator.mediaDevices.getUserMedia` & fallback capture input).
   - Grid 20 slot halaman foto dengan state memory.
   - Fitur rotate 90°, preview, retake, dan hapus.
   - Kompresi canvas client-side (maks 1600x1200, JPEG 0.75).

5. **Milestone 5: Client-Side PDF Compiler Engine & HTTP Upload**
   - Kompilasi array gambar halaman ke PDF menggunakan `jsPDF` di browser.
   - Penambahan stempel watermark otomatis pada PDF.
   - Pengiriman payload JSON Base64 via `fetch(GAS_URL, { method: 'POST', ... })` dengan penanganan redirect dan CORS Apps Script.

6. **Milestone 6: Dashboard Monitoring Rekapitulasi & PWA Testing**
   - Implementasi tab Rekapitulasi status TPS (🟢 Lengkap, 🟡 Belum Lengkap, 🔴 Kosong) via endpoint `getMonitoringSummary`.
   - Fitur pencarian, filter status, dan shortcut klik baris TPS langsung ke kamera.
   - Uji coba build, PWA manifest, dan kesiapan push ke GitHub & deploy ke Vercel.
