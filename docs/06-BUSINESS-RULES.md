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
  2. **NIP** (Wajib berupa karakter angka murni/digit 0-9, panjang 8 hingga 18 digit sesuai format standar NIP ASN/PNS. Huruf dan simbol khusus otomatis ditolak).
  3. **Jabatan** (Pilihan baku: `Sekretariat` atau `Komisioner`)
- Data identitas disimpan pada memori lokal browser (`localStorage`) sehingga operator hanya perlu mengisinya satu kali.
- Data identitas operator disertakan pada setiap transaksi unggahan:
  - Disematkan pada stempel **Watermark PDF**:
    `SIMAMBIL KPU Kab. Gorontalo | [KECAMATAN] - [DESA] - TPS [TPS] | Operator: [NAMA] ([NIP]) | Hal X/Y | [TIMESTAMP]`
    *(Wajib termuat dalam 1 baris utuh; jika teks panjang karena nama desa/operator panjang, ukuran huruf otomatis diperkecil secara dinamis dan proporsional).*
  - Dicatat ke basis data **Log_Dokumen** (Kolom K, L, M) sebagai rekam jejak audit yang akuntabel.
