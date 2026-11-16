# Database Specification (Google Sheets)

Aplikasi menggunakan Spreadsheet sebagai basis data master, rekap log upload (termasuk atribusi operator), dan view rekapitulasi progres.

### 1. Sheet: `Master_Wilayah`
Menampung hirarki wilayah Kabupaten Gorontalo (diisi langsung oleh Admin/Pengguna, tanpa data dummy otomatis):
| Kolom | Nama Field | Tipe Data | Keterangan |
|---|---|---|---|
| A | ID_TPS | String | Unique Key (misal: TPS_ASPARAGA_KARYA-INDAH_001) |
| B | NAMA_KEC | String | Nama Kecamatan |
| C | NAMA_DESA | String | Nama Desa/Kelurahan |
| D | NO_TPS | String | Format 3 digit (contoh: 001, 002, s/d 1205) |

### 2. Sheet: `Master_Kategori`
Menampung referensi berkas dan lembaga:
- Kolom A: `JENIS_FILE` (Model C-Plano, Model D-Plano)
- Kolom B: `NAMA_LEMBAGA` (Presiden dan Wakil Presiden, DPR RI, DPD RI, DPRD Provinsi, DPRD Kabupaten / Kota, Gubernur dan Wakil Gubernur, Bupati dan Wakil Bupati)
- Kolom C: `KODE_LEMBAGA` (PPWP, DPR-RI, DPD-RI, DPRD-PROV, DPRD-KAB, PILGUB, PILBUP)

### 3. Sheet: `Log_Dokumen`
Mencatat riwayat upload berkas yang berhasil masuk beserta identitas operator yang melakukan pengunggahan:
| Kolom | Nama Field | Keterangan |
|---|---|---|
| A | TIMESTAMP | Tanggal dan jam upload (WITA) |
| B | FILE_NAME | Nama file hasil standarisasi |
| C | JENIS_FILE | C-Plano / D-Plano |
| D | NAMA_LEMBAGA | Lembaga terpilih |
| E | KECAMATAN | Kecamatan terpilih |
| F | DESA | Desa terpilih |
| G | TPS | Nomor TPS terpilih |
| H | JUMLAH_HALAMAN | Total halaman yang digabung |
| I | DRIVE_FILE_ID | ID Berkas di Google Drive |
| J | DRIVE_URL | Link akses berkas di Drive |
| K | NAMA_OPERATOR | Nama lengkap operator pengunggah |
| L | NIP_OPERATOR | NIP / Nomor identitas operator |
| M | JABATAN_OPERATOR | Jabatan operator (Sekretariat / Komisioner) |

### 4. Sheet / View: `Rekap_Progres`
Menghitung status kelengkapan dokumen per TPS secara otomatis:
| Kolom | Nama Field | Formula / Keterangan |
|---|---|---|
| A | ID_TPS | Referensi dari `Master_Wilayah` |
| B | NAMA_KEC | Nama Kecamatan |
| C | NAMA_DESA | Nama Desa |
| D | NO_TPS | Nomor TPS |
| E | PPWP | Cek status upload PPWP |
| F | DPR_RI | Cek status upload DPR RI |
| G | DPD_RI | Cek status upload DPD RI |
| H | DPRD_PROV | Cek status upload DPRD Provinsi |
| I | DPRD_KAB | Cek status upload DPRD Kab/Kota |
| J | PILGUB | Cek status upload Gubernur & Wagub |
| K | PILBUP | Cek status upload Bupati & Wagub |
| L | TOTAL_UPLOAD | Jumlah jenis lembaga yang sudah diunggah |
| M | STATUS_AKHIR | `IF(TOTAL=7, "LENGKAP", IF(TOTAL>0, "BELUM LENGKAP", "KOSONG"))` |

### 5. Aturan Keamanan Data & Idempotensi Setup Database (Safe Migration Mode)
- **Non-Destructive Initialization:** Fungsi `setupDatabase()` dilarang keras memanggil `.clear()` pada sheet yang telah memiliki data.
- **Header Synchronization:** Jika sheet telah ada, fungsi hanya memeriksa dan melengkapi baris header (Baris 1) jika ada kolom baru yang belum tersedia (misal penambahan Kolom K, L, M pada `Log_Dokumen`).
- **No Dummy Data Injection:** Dilarang menyisipkan data dummy otomatis (seperti sampel kecamatan/desa tiruan). Baris data $\ge 2$ pada `Master_Wilayah` sepenuhnya diisi dan dikelola mandiri oleh Pengguna/Admin KPU.
- **Zero Data Loss:** Pengulangan eksekusi `setupDatabase()` tidak akan menghapus atau mengubah satu pun baris data yang telah diisi sebelumnya.
