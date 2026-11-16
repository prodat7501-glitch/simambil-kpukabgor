# Product Requirements Document (PRD)
## Project Name: SIMAMBIL (Sistem Informasi Manajemen Administrasi Berkas Pemilu/Pemilihan)
### Lembaga: Komisi Pemilihan Umum Kabupaten Gorontalo

### 1. Ringkasan & Tujuan
SIMAMBIL (Sistem Informasi Manajemen Administrasi Berkas Pemilu/Pemilihan) adalah aplikasi web responsif berbasis PWA (Progressive Web App) yang dikembangkan untuk **Komisi Pemilihan Umum Kabupaten Gorontalo**. Bertujuan untuk memfasilitasi petugas lapangan/operator guna mendokumentasikan berkas fisik hasil penghitungan suara (C-Plano / D-Plano) melalui kamera handphone, menyatukan (render) banyak halaman foto (hingga 20 halaman) menjadi 1 berkas dokumen utuh (PDF), serta menyimpannya otomatis ke Google Drive target khusus dengan format penamaan standar baku. Aplikasi ini menjamin akuntabilitas pengunggahan dengan mencatat identitas operator (Nama, NIP, Jabatan) pada setiap berkas yang diunggah.

### 2. Ruang Lingkup & Target Platform (Decoupled Architecture)
- **Frontend Client (Vercel & GitHub):** 
  - Aplikasi web PWA mandiri dengan identitas resmi **Komisi Pemilihan Umum Kabupaten Gorontalo**.
  - Gerbang pengisian identitas operator (Nama, NIP, Jabatan) satu kali saat pertama kali membuka aplikasi (tersimpan di *local storage* perangkat).
  - Akses kamera smartphone langsung via HTML5 Canvas / MediaStream.
  - Kompresi gambar dan penyusunan multi-halaman PDF berjalan di sisi klien (client-side browser).
  - PWA offline-ready via Service Worker & Web App Manifest (`manifest.json`).
- **Backend & Database (Google Apps Script as REST API):**
  - Google Apps Script (GAS) Web App bertindak sebagai **Headless REST API** (menerima HTTP GET & POST JSON).
  - Terhubung dengan Google Sheets (Basis Data Master Wilayah, Kategori, Rekap Progres, dan Log Dokumen lengkap dengan atribusi Nama, NIP, dan Jabatan Operator).
  - Terhubung langsung ke **Target Folder Google Drive Utama**:
    - **Folder ID:** `1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
    - **URL:** `https://drive.google.com/drive/folders/1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
    - Struktur penyimpanan otomatis berjenjang: `[Root Folder Target] / [Kecamatan] / [Desa] / [TPS] / [File.pdf]`.

### 3. Role & Hak Akses
- **Operator Lapangan / Petugas TPS:** 
  - Mengisi identitas diri (Nama, NIP, Jabatan) satu kali sebelum masuk ke workspace aplikasi.
  - Memilih filter wilayah, memotret dokumen per halaman (Halaman 1–20), preview/retake/rotate, dan upload dokumen yang sudah digabung.
- **Admin / Supervisor KPU Kabupaten Gorontalo:** 
  - Mengelola database master TPS, memantau rekapitulasi status upload per wilayah, dan melacak riwayat log siapa operator yang mengunggah setiap dokumen.

### 4. Fitur Utama
1. **Identitas & Akuntabilitas Operator:**
   - Pop-up form identitas wajib pada penggunaan pertama: Nama Lengkap, NIP, dan Jabatan.
   - Tersimpan permanen di memori browser perangkat sehingga tidak perlu diisi berulang kali.
   - Profil operator dicantumkan pada watermark PDF dan kolom database `Log_Dokumen`.
2. **Dropdown Bertingkat (Cascading Filter):**
   - Jenis Berkas: Model C-Plano, Model D-Plano.
   - Jenis Pemilihan / Lembaga: Presiden & Wapres, DPR RI, DPD RI, DPRD Provinsi, DPRD Kab/Kota, Gubernur & Wagub, Bupati & Wabup.
   - Kecamatan (19 Kecamatan Kab. Gorontalo).
   - Desa/Kelurahan (205 Desa terfilter dinamis berdasarkan Kecamatan terpilih).
   - Nomor TPS (1.205 TPS terfilter dinamis berdasarkan Desa terpilih).
3. **Kamera & Halaman Bertahap:**
   - Pemilihan slot foto dinamis: "Halaman 1", "Halaman 2", ... hingga "Halaman 20".
   - Kamera langsung via HTML5 MediaStream / capture attribute.
   - Status badge indikator halaman yang sudah diambil atau masih kosong.
   - Fitur retake / rotasi 90° / hapus foto per halaman sebelum proses render.
4. **Kompresi & Render Multi-halaman:**
   - Client-side image compression (Canvas) untuk mencegah batas muatan (payload limit).
   - Render multi-halaman menjadi 1 dokumen PDF dengan watermark stempel wilayah dan identitas operator.
5. **Standardisasi Penamaan File:**
   - Format otomatis: `[Jenis File]_[Nama Lembaga]_[Nama Kecamatan]_[Nama Desa]_[Nomor TPS]`
   - Contoh: `Model C-PLANO_DPD-RI_ASPARAGA_KARYA-INDAH_001.pdf`
6. **Modul Rekapitulasi & Monitoring Progres Wilayah:**
   - Deteksi wilayah/TPS yang belum mengunggah dokumen (Status Merah, Kuning, Hijau).
   - Filter cepat TPS pending per Kecamatan/Desa dan shortcut langsung ke pemotretan.
