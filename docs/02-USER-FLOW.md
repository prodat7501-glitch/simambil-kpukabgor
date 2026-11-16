# User Flow (Alur Penggunaan)

```mermaid
graph TD
    A[Buka PWA di Vercel URL] --> C_AUTH{Identitas Operator Terisi?}
    
    %% Alur Registrasi Identitas Pertama Kali
    C_AUTH -- Belum Ada --> OP_FORM[Tampilkan Modal Identitas: Nama, NIP, Jabatan]
    OP_FORM --> OP_SAVE[Simpan ke LocalStorage Perangkat]
    OP_SAVE --> M{Pilih Mode}
    C_AUTH -- Sudah Ada --> M
    
    %% Alur Navigasi Utama
    M -->|Dokumentasi Kamera| B[Pilih Metadata: Jenis Dokumen & Lembaga]
    M -->|Monitoring & Rekap| R[Buka Tab Rekapitulasi]
    
    %% Alur Kamera
    B --> C[Pilih Wilayah: Kecamatan -> Desa -> TPS]
    C --> D[Validasi Kelengkapan Filter]
    D --> E[Masuk Workspace Kamera Halaman]
    E --> F[Pilih Slot Halaman misal: Halaman 1]
    F --> G[Buka Kamera & Ambil Foto]
    G --> H[Preview Foto: Terima / Putar 90 / Ambil Ulang]
    H --> I{Ada Halaman Lain?}
    I -- Ya --> F
    I -- Tidak --> J[Klik Tombol 'Render & Unggah']
    J --> K[Client-side Compression & Generate PDF + Watermark Operator]
    K --> L[HTTP POST JSON Base64 + Metadata Operator ke Backend GAS]
    L --> W[GAS Simpan File ke Google Drive & Catat ke Sheets Log dgn Nama Operator]
    W --> N[Frontend Terima Response 200 OK & Tampilkan Notifikasi Sukses]

    %% Alur Monitoring
    R --> R1[HTTP GET Monitoring Data dari Backend GAS]
    R1 --> R2[Pilih Filter Kecamatan / Desa]
    R2 --> R3[Tampilkan Status TPS: Hijau/Kuning/Merah]
    R3 --> R4[Klik Baris TPS Kosong / Belum Lengkap]
    R4 --> B
```

### Langkah Interaksi Detail:
1. **Inisialisasi & Pemeriksaan Identitas Operator:**
   - Petugas membuka aplikasi PWA via browser domain Vercel.
   - Sistem memeriksa apakah data profil operator (`nama`, `nip`, `jabatan`) sudah ada di `localStorage`.
   - Jika **belum ada**, pop-up modal profil operator muncul dan mewajibkan pengisian sebelum dapat melanjutkan.
   - Jika **sudah ada**, pengguna langsung masuk ke workspace utama. Tersedia tombol edit profil di header jika ingin mengubah data.
2. **Pengambilan Master Data:**
   - Frontend mengirimkan request `HTTP GET ?action=getMasterData` ke URL Web App Google Apps Script.
   - Mengisi dropdown Jenis Dokumen, Lembaga, dan hierarki Kecamatan -> Desa -> TPS.
3. **Seleksi Wilayah & Lembaga:**
   - Memilih Jenis Dokumen -> Memilih Lembaga.
   - Memilih Kecamatan -> Dropdown Desa memuat desa di kecamatan tersebut.
   - Memilih Desa -> Dropdown TPS memuat daftar TPS di desa tersebut.
4. **Capture Halaman:**
   - Sistem menampilkan tombol kisi slot `Halaman 1` s/d `Halaman 20`.
   - Petugas menekan slot halaman yang ingin diambil, kamera aktif, foto diambil dan disimpan di memory browser.
   - Slot halaman berubah warna hijau (terisi).
5. **Finalisasi, Watermark & Render:**
   - Petugas menekan tombol `Render & Simpan PDF`.
   - Engine client-side (jsPDF) menggabungkan semua halaman menjadi satu dokumen PDF dengan watermark stempel wilayah dan identitas operator.
   - Frontend mengirimkan payload JSON via `fetch(GAS_URL, { method: 'POST', body: JSON.stringify(...) })`.
6. **Logging & Monitoring:**
   - Google Apps Script mencatat waktu, nama file, URL drive, jumlah halaman, dan **identitas operator (Nama, NIP, Jabatan)** pada sheet `Log_Dokumen`.
