# Database Specification (Google Sheets)

Aplikasi menggunakan Spreadsheet sebagai basis data master, rekap log upload, dan view rekapitulasi progres.

### 1. Sheet: `Master_Wilayah`
Menampung hirarki wilayah Kabupaten Gorontalo:
| Kolom | Nama Field | Tipe Data | Keterangan |
|---|---|---|---|
| A | ID_TPS | String | Unique Key (misal: TPS_ASPARAGA_KARYA-INDAH_001) |
| B | NAMA_KEC | String | Nama dari 19 Kecamatan |
| C | NAMA_DESA | String | Nama dari 205 Desa/Kelurahan |
| D | NO_TPS | String | Format 3 digit (contoh: 001, 002, s/d 1205) |

### 2. Sheet: `Master_Kategori`
Menampung referensi berkas dan lembaga:
- Kolom A: `JENIS_FILE` (Model C-Plano, Model D-Plano)
- Kolom B: `NAMA_LEMBAGA` (Presiden dan Wakil Presiden, DPR RI, DPD RI, DPRD Provinsi, DPRD Kabupaten / Kota, Gubernur dan Wakil Gubernur, Bupati dan Wakil Bupati)
- Kolom C: `KODE_LEMBAGA` (PPWP, DPR-RI, DPD-RI, DPRD-PROV, DPRD-KAB, PILGUB, PILBUP)

### 3. Sheet: `Log_Dokumen`
Mencatat riwayat upload berkas yang berhasil masuk:
| Kolom | Nama Field | Keterangan |
|---|---|---|
| A | TIMESTAMP | Tanggal dan jam upload |
| B | FILE_NAME | Nama file hasil standarisasi |
| C | JENIS_FILE | C-Plano / D-Plano |
| D | NAMA_LEMBAGA | Lembaga terpilih |
| E | KECAMATAN | Kecamatan |
| F | DESA | Desa |
| G | TPS | Nomor TPS |
| H | JUMLAH_HALAMAN | Total halaman yang digabung |
| I | DRIVE_FILE_ID | ID Berkas di Google Drive |
| J | DRIVE_URL | Link akses berkas di Drive |

### 4. Sheet / View: `Rekap_Progres`
Menghitung status kelengkapan dokumen per TPS secara otomatis:
| Kolom | Nama Field | Formula / Keterangan |
|---|---|---|
| A | ID_TPS | Referensi dari `Master_Wilayah` |
| B | NAMA_KEC | Nama Kecamatan |
| C | NAMA_DESA | Nama Desa |
| D | NO_TPS | Nomor TPS |
| E | PPWP | `IF(COUNTIFS(Log!C:C,"Model C-Plano", Log!D:D,"Presiden dan Wakil Presiden", Log!G:G, D2)>0, "V", "-")` |
| F | DPR_RI | Cek status DPR RI |
| G | DPD_RI | Cek status DPD RI |
| H | DPRD_PROV | Cek status DPRD Provinsi |
| I | DPRD_KAB | Cek status DPRD Kab/Kota |
| J | PILGUB | Cek status Gubernur & Wagub |
| K | PILBUP | Cek status Bupati & Wabup |
| L | TOTAL_UPLOAD | Jumlah jenis lembaga yang sudah diunggah |
| M | STATUS_AKHIR | `IF(TOTAL=7, "LENGKAP", IF(TOTAL>0, "BELUM LENGKAP", "KOSONG"))` |
