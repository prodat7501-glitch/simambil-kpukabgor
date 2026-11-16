# Product Requirements Document (PRD)
## Project Name: SIMAMBIL (Sistem Informasi Manajemen Administrasi Berkas Pemilu/Pemilihan)

### 1. Ringkasan & Tujuan
SIMAMBIL (Sistem Informasi Manajemen Administrasi Berkas Pemilu/Pemilihan) adalah aplikasi web responsif berbasis PWA (Progressive Web App) untuk petugas lapangan/admin guna mendokumentasikan berkas fisik hasil penghitungan suara (C-Plano / D-Plano) melalui kamera handphone, menyatukan (render) banyak halaman foto (hingga 20 halaman) menjadi 1 berkas dokumen utuh (PDF), serta menyimpannya otomatis ke Google Drive target khusus dengan format penamaan standar baku. Dilengkapi modul rekapitulasi monitoring wilayah untuk mendeteksi TPS yang belum/sudah mengunggah berkas secara real-time.

### 2. Ruang Lingkup & Target Platform (Decoupled Architecture)
- **Frontend Client (Vercel & GitHub):** 
  - Aplikasi web PWA mandiri (di-push ke GitHub dan di-deploy langsung di Vercel).
  - Akses kamera smartphone langsung via HTML5 Canvas / MediaStream.
  - Kompresi gambar dan penyusunan multi-halaman PDF berjalan di sisi klien (client-side browser).
  - PWA offline-ready via Service Worker & Web App Manifest (`manifest.json`).
- **Backend & Database (Google Apps Script as REST API):**
  - Google Apps Script (GAS) Web App bertindak sebagai **Headless REST API** (menerima HTTP GET & POST JSON).
  - Terhubung dengan Google Sheets (Basis Data Master Wilayah, Kategori, Log, dan Rekap Progres).
  - Terhubung langsung ke **Target Folder Google Drive Utama**:
    - **Folder ID:** `1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
    - **URL:** `https://drive.google.com/drive/folders/1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
    - Struktur penyimpanan otomatis berjenjang: `[Root Folder Target] / [Kecamatan] / [Desa] / [TPS] / [File.pdf]`.

### 3. Role & Hak Akses
- **Petugas Lapangan / Operator TPS:** Memilih filter wilayah, memotret dokumen per halaman (Halaman 1–20), preview/retake/rotate, dan upload dokumen yang sudah digabung.
- **Admin / Supervisor:** Mengelola database master TPS, memantau rekapitulasi status upload per wilayah, dan mengecek deteksi TPS kosong/pending.

### 4. Fitur Utama
1. **Dropdown Bertingkat (Cascading Filter):**
   - Jenis Berkas: Model C-Plano, Model D-Plano.
   - Jenis Pemilihan / Lembaga: Presiden & Wapres, DPR RI, DPD RI, DPRD Provinsi, DPRD Kab/Kota, Gubernur & Wagub, Bupati & Wabup.
   - Kecamatan (19 Kecamatan Kab. Gorontalo).
   - Desa/Kelurahan (205 Desa terfilter dinamis berdasarkan Kecamatan terpilih).
   - Nomor TPS (1.205 TPS terfilter dinamis berdasarkan Desa terpilih).
2. **Kamera & Halaman Bertahap:**
   - Pemilihan slot foto dinamis: "Halaman 1", "Halaman 2", ... hingga "Halaman 20".
   - Kamera langsung via HTML5 MediaStream / capture attribute.
   - Status badge indikator halaman yang sudah diambil atau masih kosong.
   - Fitur retake / rotasi 90° / hapus foto per halaman sebelum proses render.
3. **Kompresi & Render Multi-halaman:**
   - Client-side image compression (Canvas) untuk mencegah batas muatan (payload limit).
   - Render multi-halaman menjadi 1 dokumen PDF dengan watermark stempel wilayah.
4. **Standardisasi Penamaan File:**
   - Format otomatis: `[Jenis File]_[Nama Lembaga]_[Nama Kecamatan]_[Nama Desa]_[Nomor TPS]`
   - Contoh: `Model C-PLANO_DPD-RI_ASPARAGA_KARYA-INDAH_001.pdf`
5. **Modul Rekapitulasi & Monitoring Progres Wilayah:**
   - Deteksi wilayah/TPS yang belum mengunggah dokumen (Status Merah, Kuning, Hijau).
   - Filter cepat TPS pending per Kecamatan/Desa dan shortcut langsung ke pemotretan.
