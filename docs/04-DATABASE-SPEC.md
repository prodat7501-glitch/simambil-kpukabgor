# Database Specification (Google Sheets)

Aplikasi menggunakan Spreadsheet sebagai basis data master, rekap log upload (termasuk atribusi operator), dan view rekapitulasi progres.

### 1. Sheet: `Master_Wilayah` (Khusus Pemilu - SSOT 1.205 TPS)
Menampung hirarki wilayah Pemilu Kabupaten Gorontalo (diisi langsung oleh Admin/Pengguna, tanpa data dummy otomatis):
| Kolom | Nama Field | Tipe Data | Keterangan |
|---|---|---|---|
| A | ID_TPS | String | Unique Key (misal: TPS_ASPARAGA_KARYA-INDAH_001) |
| B | NAMA_KEC | String | Nama Kecamatan (19 Kecamatan) |
| C | NAMA_DESA | String | Nama Desa/Kelurahan (205 Desa/Kelurahan) |
| D | NO_TPS | String | Format 3 digit (contoh: 001, 002, s/d 1205) |
| E | JUMLAH_DPT | Number / String | (Opsional) Jumlah DPT per TPS |

### 1b. Sheet: `Master_Wilayah_Pilkada` (Khusus Pilkada - Regrouping TPS)
Menampung hirarki wilayah Pilkada Kabupaten Gorontalo hasil regrouping/penggabungan TPS Pilkada:
| Kolom | Nama Field | Tipe Data | Keterangan |
|---|---|---|---|
| A | ID_TPS | String | Unique Key (misal: PILKADA_ASPARAGA_KARYA-INDAH_001) |
| B | NAMA_KEC | String | Nama Kecamatan |
| C | NAMA_DESA | String | Nama Desa/Kelurahan |
| D | NO_TPS | String | Format 3 digit (nomor TPS hasil regrouping Pilkada) |
| E | JUMLAH_DPT | Number / String | (Opsional) Jumlah DPT Pilkada per TPS |
*Catatan:* Jika sheet `Master_Wilayah_Pilkada` belum diisi oleh admin KPU, sistem secara otomatis dan aman menggunakan data `Master_Wilayah` sebagai fallback darurat.

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
Menghitung status kelengkapan dokumen per TPS secara otomatis dengan evaluasi target halaman per lembaga:
| Kolom | Nama Field | Formula / Keterangan |
|---|---|---|
| A | ID_TPS | Referensi dari `Master_Wilayah` |
| B | NAMA_KEC | Nama Kecamatan |
| C | NAMA_DESA | Nama Desa |
| D | NO_TPS | Nomor TPS |
| E | PPWP | Cek status upload PPWP (Wajib $\ge$ 3 Halaman) |
| F | DPR_RI | Cek status upload DPR RI (Wajib $\ge$ 20 Halaman) |
| G | DPD_RI | Cek status upload DPD RI (Wajib $\ge$ 3 Halaman) |
| H | DPRD_PROV | Cek status upload DPRD Provinsi (Wajib $\ge$ 20 Halaman) |
| I | DPRD_KAB | Cek status upload DPRD Kab/Kota (Wajib $\ge$ 20 Halaman) |
| J | PILGUB | Cek status upload Gubernur & Wagub (Wajib $\ge$ 3 Halaman) |
| K | PILBUP | Cek status upload Bupati & Wagub (Wajib $\ge$ 3 Halaman) |
| L | TOTAL_LENGKAP | Jumlah jenis lembaga yang memenuhi target halaman (0 - 7) |
| M | STATUS_AKHIR | `IF(TOTAL_LENGKAP=7, "LENGKAP", IF(TOTAL_UPLOAD>0, "BELUM LENGKAP", "KOSONG"))` |

### 5. Aturan Keamanan Data & Idempotensi Setup Database (Safe Migration Mode)
- **Non-Destructive Initialization:** Fungsi `setupDatabase()` dilarang keras memanggil `.clear()` pada sheet yang telah memiliki data.
- **Header Synchronization:** Jika sheet telah ada, fungsi hanya memeriksa dan melengkapi baris header (Baris 1) jika ada kolom baru yang belum tersedia (misal penambahan Kolom K, L, M pada `Log_Dokumen`).
- **No Dummy Data Injection:** Dilarang menyisipkan data dummy otomatis (seperti sampel kecamatan/desa tiruan). Baris data $\ge 2$ pada `Master_Wilayah` sepenuhnya diisi dan dikelola mandiri oleh Pengguna/Admin KPU.
- **Zero Data Loss:** Pengulangan eksekusi `setupDatabase()` tidak akan menghapus atau mengubah satu pun baris data yang telah diisi sebelumnya.
