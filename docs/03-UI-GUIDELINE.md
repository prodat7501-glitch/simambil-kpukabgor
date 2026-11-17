# UI Guidelines & Design System

### 1. Skema Warna & Tema
- **Warna Utama (Brand):** KPU Maroon (`#800000`), Dark Red (`#990000`), Clean White (`#FFFFFF`).
- **Aksen & State:**
  - Gold / Amber (`#D4AF37`) untuk tombol aktif/proses.
  - Hijau (`#2E7D32`): Berkas Lengkap / Slot Halaman Terisi.
  - Kuning/Orange (`#F57C00`): Berkas Belum Lengkap (Sebagian Lembaga Masuk).
  - Merah (`#C62828`): Berkas Kosong / Belum Ada Upload sama sekali.
- **Background:** Netral bersih (`#F8F9FA` / `#121212` pada Dark Mode).

### 2. Layout & Responsivitas
- **Mobile First Approach:** Optimal pada resolusi layar smartphone (360px - 480px width).
- **Tab Navigasi Bawah (Bottom Navigation Bar):**
  - Tab 1: **Kamera & Upload** (Icon Kamera)
  - Tab 2: **Rekap & Pratinjau** (Icon Chart/Clipboard)
- **Sticky Bottom Action Bar:** Tombol besar "Ambil Foto" dan tombol konfirmasi "Render & Simpan (X Halaman)".

### 4. Standar Tampilan Mobile / Android (Professional Enterprise Grade)
- **Two-Tier Header Structure:**
  - Baris Atas: Logo KPU + Tiga Baris Tipografi Resmi:
    - Baris 1: Judul Aplikasi `"SIMAMBIL"`
    - Baris 2: Subtitle Instansi `"KPU KABUPATEN GORONTALO"`
    - Baris 3: Kepanjangan Resmi `"Sistem Informasi Manajemen Arsip Pemilu/Pemilihan Berbasis Mobile"` (tulisan kecil dipaskan presisi dalam 1 baris utuh)
    + Status Koneksi (Online/Offline). Endpoint API terkonfigurasi otomatis dan tombol pengaturan dihilangkan agar antarmuka bersih dan terhindar dari salah konfigurasi oleh operator.
  - Baris Bawah: Kartu Identitas Operator (Nama, Jabatan: Sekretariat / Komisioner, dan NIP) yang berkontras tinggi, mudah dibaca, dan responsif terhadap sentuhan satu jempol.
- **In-App Toast & Dialog System (Tanpa `alert()` Bawaan Browser):**
  - Seluruh notifikasi sukses, peringatan, maupun validasi menggunakan komponen dialog in-app dengan animasi halus, ikon status tematik, dan tipografi rapi, sehingga tidak lagi memunculkan popup abu-abu default browser Android (`...menyatakan [Oke]`).
- **Custom Mobile Bottom Sheet Picker (Pengganti Dropdown Bawaan OS):**
  - Menggantikan dialog picker radio hitam/abu-abu bawaan browser Android dengan **Bottom Sheet Picker kustom** yang modern dan elegan.
  - Dilengkapi fitur pencarian cepat (*instant search filter*) untuk memudahkan operator mencari Kecamatan, Desa, maupun TPS tanpa perlu menggulir ratusan daftar opsi.
  - Memiliki header jelas dengan drag handle bar, indikator centang (*check icon*) marun pada opsi aktif, dan menutup otomatis secara mulus begitu opsi dipilih.
  - Sinkron secara dua arah (*two-way binding*) dengan elemen formulir dan logika cascading (*Kecamatan -> Desa -> TPS*).
- **Slot Foto & Bottom Action Bar:**
  - Slot foto 20 halaman memiliki status kosong dan terisi yang kontras, dengan preview thumbnail jelas dan centang status hijau.
  - Sticky action bar menggunakan efek glassmorphism (`backdrop-filter: blur(12px)`) dengan tombol simpan & render beraksen marun elegan.
- **Fitur Blitz / Flash Kamera (Penerangan Kondisi Gelap):**
  - Dilengkapi tombol Blitz / Flash (`⚡`) pada header dan footer jendela bidik kamera.
  - Mengontrol lampu LED senter fisik perangkat (*Hardware Torch*) via WebRTC `applyConstraints({ advanced: [{ torch: true }] })`.
  - Dilengkapi *fallback* penerang layar (*Screen Glow Light*) otomatis jika perangkat tidak mendukung senter hardware, memastikan dokumen C-Plano tetap dapat difoto dengan jelas meskipun TPS dalam kondisi gelap atau minim cahaya.

### 5. Fitur Pratinjau Dokumen Terpadu (Rekap & Pratinjau)
- Menu tab kedua dinamai **Rekap & Pratinjau**.
- Pada dialog sukses pengunggahan berkas, tautan eksternal "Buka Google Drive" ditiadakan guna menjaga alur kerja tetap terpusat di dalam aplikasi.
- Seluruh dokumen yang telah diunggah dapat dilihat pratinjaunya secara langsung dari menu **Rekap & Pratinjau** melalui tombol **Pratinjau 👁️** pada rincian 7 lembaga per TPS.
- Pratinjau berkas PDF dibuka menggunakan **Modal Viewer Terpadu** berbasis Google Drive Embed Viewer tanpa mengharuskan pengguna berpindah aplikasi, lengkap dengan tombol opsi "Layar Penuh ↗️" jika ingin membuka tampilan browser penuh.
