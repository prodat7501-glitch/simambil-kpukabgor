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
  - Tab 2: **Rekap & Monitoring** (Icon Chart/Clipboard)
- **Sticky Bottom Action Bar:** Tombol besar "Ambil Foto" dan tombol konfirmasi "Render & Simpan (X Halaman)".

### 4. Standar Tampilan Mobile / Android (Professional Enterprise Grade)
- **Two-Tier Header Structure:**
  - Baris Atas: Logo KPU + Tipografi resmi "SIMAMBIL" & "KPU KABUPATEN GORONTALO" + Status Koneksi (Online/Offline). Endpoint API terkonfigurasi otomatis dan tombol pengaturan dihilangkan agar antarmuka bersih dan terhindar dari salah konfigurasi oleh operator.
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
