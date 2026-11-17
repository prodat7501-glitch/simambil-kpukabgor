# Business Rules & Logic

### 1. Aturan Penamaan File (Strict Naming Convention)
1. Format baku:
   `[JENIS_FILE]_[KODE_LEMBAGA]_[KECAMATAN]_[DESA]_[TPS]`
2. Aturan Sanitasi String:
   - Huruf Kapital (Uppercase).
   - Karakter spasi diganti dengan strip (`-`).
   - Hilangkan karakter non-alfanumerik khusus selain strip (`-`) dan underscore (`_`).
   - Nomor TPS diformat standar 3 digit (contoh: TPS 1 ditulis `001`).
3. Contoh Validasi:
   - *Input:* Model C-Plano, DPD RI, Asparaga, Karya Indah, 1
   - *Output File:* `Model C-PLANO_DPD-RI_ASPARAGA_KARYA-INDAH_001.pdf`

### 2. Aturan Halaman & Pengambilan Foto (Dynamic Slot Allocation)
- **Alokasi Slot Halaman Dinamis:** Jumlah slot foto pada antarmuka Kamera & Upload menyesuaikan secara otomatis dengan jenis pemilihan/lembaga yang dipilih:
  - **3 Slot Foto:** Untuk PPWP, DPD RI, Gubernur & Wagub (PILGUB), dan Bupati & Wabup (PILBUP).
  - **20 Slot Foto:** Untuk DPR RI, DPRD Provinsi, dan DPRD Kabupaten/Kota.
  - Sistem dilarang menampilkan 20 slot untuk seluruh lembaga guna mencegah kebingungan operator dan menjaga kejelasan target fisik dokumen.
- Halaman harus terurut secara sekuensial pada saat rendering (Halaman 1 menjadi page 1 di PDF, dst).
- Slot halaman yang tidak diambil/kosong akan diabaikan (tidak disisipkan halaman kosong ke PDF).
- **Validasi Unggah Belum Lengkap:** Jika operator mengunggah dokumen dengan jumlah halaman kurang dari target (misal DPR RI hanya 17 dari 20 halaman), sistem menampilkan konfirmasi khusus yang mencantumkan jumlah halaman yang belum lengkap/hilang sebelum berkas diproses.

### 3. Batasan Teknis, Kuota Ukuran & Pengamanan Berkas
- **Kompresi Resolusi Dinamis:**
  - Untuk lembaga 3 halaman: Resolusi canvas maksimal 1500x1125, kualitas JPEG 0.72.
  - Untuk lembaga 20 halaman: Resolusi canvas maksimal 1280x960, kualitas JPEG 0.66.
- **Strict File Size Quotas (Aturan Batas Ukuran File):**
  - **Maksimal 1 MB:** Untuk berkas dokumen 3 halaman (PPWP, DPD RI, PILGUB, PILBUP).
  - **Maksimal 5 MB:** Untuk berkas dokumen 20 halaman (DPR RI, DPRD Provinsi, DPRD Kabupaten/Kota).
  - Sistem melakukan validasi ganda (*client-side* sebelum upload dan *server-side* pada backend Google Apps Script). Pengunggahan berkas yang melampaui kuota akan ditolak demi mencegah pemborosan storage dan memory buffer overflow.
- **Verifikasi Integritas & Magic Bytes:** Seluruh berkas yang diterima wajib berformat PDF asli dengan header byte `%PDF-` (hex `25 50 44 46`).
- **Otentikasi & Proteksi Spreadsheet:**
  - Seluruh komunikasi API dilindungi dengan token otentikasi resmi.
  - Seluruh data teks yang dicatat ke Google Sheets disanitasi dari karakter awalan formula (`=`, `+`, `-`, `@`) guna mencegah *Spreadsheet Formula Injection*.

### 4. Aturan Rekapitulasi, Target Halaman & Deteksi Wilayah Pending
1. **Daftar Target Kelengkapan Halaman per Jenis Pemilihan / Lembaga:**
   Untuk dinyatakan lengkap pada setiap jenis pemilihan, berkas dokumen yang diunggah wajib memenuhi target minimum jumlah halaman berikut:
   - **PPWP (Presiden dan Wakil Presiden):** 3 Halaman
   - **DPD RI:** 3 Halaman
   - **DPR RI:** 20 Halaman
   - **DPRD PROVINSI:** 20 Halaman
   - **DPRD KABUPATEN/KOTA:** 20 Halaman
   - **Gubernur dan Wakil Gubernur (PILGUB):** 3 Halaman
   - **Bupati dan Wakil Bupati (PILBUP):** 3 Halaman

2. **Aturan Evaluasi Status TPS & Deteksi Halaman Hilang:**
   - **LENGKAP (🟢):** Ditetapkan jika dan hanya jika **seluruh 7 jenis pemilihan** telah diunggah dan **masing-masing telah memenuhi target halaman minimumnya**.
   - **BELUM LENGKAP (🟡):** Ditetapkan jika sudah ada minimal 1 berkas diunggah pada TPS tersebut, namun **belum semua 7 pemilihan memenuhi target halaman masing-masing** (misal ada berkas yang halamannya masih kurang atau belum diunggah).
   - **KOSONG / PENDING (🔴):** Ditetapkan jika belum ada satupun dokumen yang diunggah untuk TPS tersebut (`totalUpload = 0`).
   - **Deteksi Halaman Hilang/Kurang:** Sistem menghitung selisih halaman secara presisi (`kurang = target - actual`). Jika berkas terunggah memiliki jumlah halaman di bawah target (misalnya DPR RI hanya 17 dari 20 halaman, artinya terdapat 3 halaman hilang/kurang), sistem menampilkan peringatan khusus (alert banner) dan indikator visual pada kartu TPS di menu Rekap & Monitoring agar segera ditindaklanjuti oleh koordinator/operator.

3. **Deteksi Instan Wilayah Belum Diunggah (Overview Wilayah Tanpa Dropdown):**
   - Menu Rekap & Monitoring menyediakan mode ringkasan per wilayah (Kecamatan & Desa) yang langsung menampilkan titik-titik wilayah yang belum mengunggah berkas secara instan tanpa mengharuskan pengguna memilih filter dropdown wilayah satu per satu.
   - Pimpinan dan koordinator dapat langsung memilah wilayah pending/kosong dengan satu ketukan tombol filter (`🔴 Hanya Wilayah Belum Diunggah`), lengkap dengan jumlah TPS yang belum tuntas di setiap kecamatan dan desa.

### 5. Aturan Folder Penyimpanan Google Drive
- Seluruh dokumen PDF yang diunggah disimpan pada Root Folder Google Drive target:
  - **Drive Folder ID:** `1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
  - **URL:** `https://drive.google.com/drive/folders/1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
- Di dalam folder root tersebut, sistem secara otomatis membentuk subfolder berjenjang jika belum tersedia:
  `[Folder Target: 1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI] / [Kecamatan] / [Desa] / TPS [TPS] / [File.pdf]`

### 6. Aturan Identitas & Akuntabilitas Operator
- Sebelum dapat menggunakan aplikasi, operator wajib menginputkan data diri:
  1. **Nama Lengkap**
  2. **NIP:**
     - **Sekretariat:** Wajib berupa karakter angka murni (digit 0-9), panjang 8 hingga 18 digit sesuai format standar NIP ASN/PNS KPU.
     - **Komisioner:** Diperbolehkan mengisi tanda strip (`-`) jika non-PNS/non-ASN, atau diisi angka murni jika memiliki NIP. Karakter huruf selain angka/tanda `-` otomatis ditolak.
  3. **Jabatan** (Pilihan baku: `Sekretariat` atau `Komisioner`)
- Data identitas disimpan pada memori lokal browser (`localStorage`) sehingga operator hanya perlu mengisinya satu kali.
- Data identitas operator disertakan pada setiap transaksi unggahan:
  - Disematkan pada stempel **Watermark PDF**:
    `SIMAMBIL KPU Kab. Gorontalo | [KECAMATAN] - [DESA] - TPS [TPS] | Operator: [NAMA] ([NIP]) | Hal X/Y | [TIMESTAMP]`
    *(Wajib termuat dalam 1 baris utuh; jika teks panjang karena nama desa/operator panjang, ukuran huruf otomatis diperkecil secara dinamis dan proporsional).*
  - Dicatat ke basis data **Log_Dokumen** (Kolom K, L, M) sebagai rekam jejak audit yang akuntabel.

### 7. Aturan Default Wilayah & Retensi Sesi Dokumentasi (Sticky Region Session)
1. **Default State Formulir Wilayah:**
   - Saat aplikasi pertama kali dibuka atau formulir direset, pilihan Kecamatan, Desa, dan Nomor TPS berada dalam kondisi **KOSONG** (default `-- Pilih Kecamatan --`, `-- Pilih Desa --`, `-- Pilih TPS --`).
   - Sistem dilarang memilihkan secara otomatis kecamatan atau desa urutan teratas demi memberi kebebasan penuh bagi operator untuk menentukan titik kerja dokumentasi secara manual.
   - Tampilan pratinjau nama berkas menampilkan placeholder panduan (`[Pilih Kecamatan, Desa, & TPS Terlebih Dahulu]`).
2. **Retensi Sesi Wilayah (Sticky Region Workflow):**
   - Saat operator telah menentukan suatu wilayah (Kecamatan dan Desa) dan melakukan pemotretan dokumen TPS, pilihan Kecamatan dan Desa tersebut **wajib dipertahankan** selama proses render dan pengiriman berkas berlangsung.
   - Setelah satu dokumen TPS berhasil dirender dan dikirim ke server/Google Drive:
     - Kecamatan dan Desa **tetap dipertahankan aktif**.
     - Sistem secara cerdas mengarahkan ke nomor TPS berikutnya di desa tersebut yang belum selesai/belum diunggah (auto-advance TPS).
     - Formulir slot foto di-reset bersih agar operator dapat langsung melanjutkan dokumentasi TPS berikutnya tanpa memilih ulang wilayah.
3. **Reset Default Otomatis:**
   - Jika **seluruh nomor TPS pada Desa tersebut telah selesai dirender dan dikirim**, sistem secara otomatis me-reset pilihan Kecamatan, Desa, dan TPS kembali ke status default kosong (`-- Pilih Kecamatan --`), siap untuk memilih desa atau kecamatan baru.

---

### 6. ATURAN KINERJA PEMUATAN WILAYAH & CACHING (STALE-WHILE-REVALIDATE)
1. **Instant Hydration (0 Milliseconds UX):**
   - Aplikasi wajib membaca dan menghidrasi Master Data Wilayah (`SIMAMBIL_MASTER_DATA_CACHE_V2`) dan Rekapitulasi Monitoring (`SIMAMBIL_REKAP_SUMMARY_CACHE_V2`) langsung dari `localStorage` saat event `DOMContentLoaded` dipicu.
   - Operator yang membuka kembali aplikasi atau login ulang tidak boleh menunggu pemuatan jaringan untuk melihat daftar 19 Kecamatan dan ringkasan rekapitulasi.
2. **Parallel Background Revalidation:**
   - Pemanggilan `getMasterData` dan `getMonitoringSummary` dijalankan secara paralel (asinkron bersamaan), tidak dalam bentuk serial waterfall.
   - Setiap pemanggilan jaringan dilengkapi timeout 12 detik via `AbortController` guna mencegah UI menggantung saat koneksi seluler tidak stabil.
3. **Preservation of Active Selection:**
   - Pembaruan data latar belakang tidak boleh menghapus atau mereset pilihan wilayah yang sedang dipilih aktif oleh operator.
4. **Backend Caching (Google Apps Script):**
   - Endpoint `getMasterData` di-cache di `CacheService.getScriptCache()` hingga 6 jam untuk merespon dalam waktu `<50ms`.
   - Endpoint `getMonitoringSummary` di-cache di `CacheService.getScriptCache()` selama 120 detik, dan secara otomatis di-evict (*cache invalidation*) setiap kali terjadi transaksi upload dokumen baru via `uploadCompiledDocument`.

---

### 7. ATURAN INTEGRITAS DATA WILAYAH & JUMLAH TOTAL TPS (1205 TPS)
1. **Single Source of Truth (SSOT):**
   - Basis data sheet `Master_Wilayah` adalah acuan tunggal dan mutlak untuk total **1205 TPS** dan **19 Kecamatan** di Kabupaten Gorontalo.
2. **Normalisasi Kunci Wilayah (Space & Hyphen Insensitive):**
   - Pencocokan riwayat unggahan pada `Log_Dokumen` dengan `Master_Wilayah` wajib dinormalisasi menggunakan fungsi `normalizeWilayahKey()`.
   - Variasi penulisan seperti spasi, tanda strip, atau huruf besar/kecil (contoh: `TALAGA JAYA` vs `TALAGA-JAYA`, `BATUDAA PANTAI` vs `BATUDAA-PANTAI`) wajib terhubung ke entitas TPS resmi yang sama.
3. **Pencegahan TPS Phantom / Duplikasi Anomali:**
   - Sistem dilarang menambahkan baris TPS baru ke dalam ringkasan monitoring yang tidak tercantum dalam daftar resmi `Master_Wilayah`.
   - Rekapitulasi pada antarmuka pengguna secara otomatis melakukan rekonsiliasi dan deduplikasi sehingga metrik `Total TPS` selalu konsisten pada angka **1205** dan jumlah kecamatan tetap **19**.
