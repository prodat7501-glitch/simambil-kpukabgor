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

### 2. Aturan Halaman & Pengambilan Foto
- Jumlah halaman per dokumen: Minimal 1 halaman, maksimal 20 halaman.
- Halaman harus terurut secara sekuensial pada saat rendering (Halaman 1 menjadi page 1 di PDF, dst).
- Slot halaman yang tidak diambil/kosong akan diabaikan (tidak disisipkan halaman kosong ke PDF).

### 3. Batasan Teknis & Kompresi (Payload Optimization)
- Setiap foto yang diambil dari kamera beresolusi tinggi wajib dikompresi di sisi browser (client-side canvas) ke resolusi maksimal 1600x1200 dengan kualitas JPEG 0.7 - 0.8 sebelum dikonversi ke PDF.
- File PDF gabungan berukuran di bawah 15 MB agar upload via HTTP REST API berjalan stabil tanpa timeout.

### 4. Aturan Rekapitulasi & Deteksi Wilayah Pending
- Suatu TPS dinyatakan **LENGKAP (🟢)** jika seluruh jenis dokumen/lembaga target (7 pemilihan) sudah terupload.
- Suatu TPS dinyatakan **BELUM LENGKAP (🟡)** jika sudah ada minimal 1 dokumen terupload tetapi belum lengkap 7 pemilihan.
- Suatu TPS dinyatakan **KOSONG / PENDING (🔴)** jika belum ada dokumen sama sekali yang tercatat di `Log_Dokumen`.

### 5. Aturan Folder Penyimpanan Google Drive
- Seluruh dokumen PDF yang diunggah disimpan pada Root Folder Google Drive target:
  - **Drive Folder ID:** `1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
  - **URL:** `https://drive.google.com/drive/folders/1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI`
- Di dalam folder root tersebut, sistem secara otomatis membentuk subfolder berjenjang jika belum tersedia:
  `[Folder Target: 1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI] / [Kecamatan] / [Desa] / TPS [TPS] / [File.pdf]`
