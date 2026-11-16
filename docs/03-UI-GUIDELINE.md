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

### 3. Komponen Spesifik
- **Selector Wilayah:** Native dropdown / Searchable Dropdown dengan label jelas dan font legible.
- **Page Grid Selector:** 
  - Grid 4 kolom x 5 baris (menampung 20 halaman).
  - State kosong: Kotak abu-abu bertuliskan angka halaman `01`, `02`, dst.
  - State terisi: Thumbnail mini dari foto + badge centang hijau + tombol aksi (hapus / rotate).
- **Tabel Rekapitulasi Progres:**
  - Kartu indikator: Total TPS, Lengkap, Kurang, Kosong.
  - Tabel matriks ringkas dengan chip warna status per TPS.
- **Camera Modal / Viewport:** Tombol shutter bundar besar di tengah bawah layar.
- **Loading Overlay:** Progress bar persentase ("Mengompres foto...", "Menggabungkan dokumen...", "Menyimpan ke Google Drive...").
