# API Specification (Google Apps Script REST API Contract)

Komunikasi antara client-side frontend (di-host di Vercel) dengan Google Apps Script backend menggunakan protokol HTTP REST API standar (`doGet` dan `doPost`).

### Base Endpoint
```text
https://script.google.com/macros/s/[SCRIPT_ID]/exec
```

---

### 1. Endpoint: `GET ?action=getMasterData`
- **Fungsi:** Mengambil data referensi Jenis Dokumen, Lembaga, dan hierarki wilayah Kecamatan, Desa, serta TPS.
- **Method:** `GET`
- **URL Parameter:** `action=getMasterData`
- **Response Format (JSON):**
```json
{
  "status": "success",
  "jenisDokumen": ["Model C-Plano", "Model D-Plano"],
  "lembaga": [
    {"nama": "Presiden dan Wakil Presiden", "kode": "PPWP"},
    {"nama": "DPR RI", "kode": "DPR-RI"},
    {"nama": "DPD RI", "kode": "DPD-RI"},
    {"nama": "DPRD Provinsi", "kode": "DPRD-PROV"},
    {"nama": "DPRD Kabupaten / Kota", "kode": "DPRD-KAB"},
    {"nama": "Gubernur dan Wakil Gubernur", "kode": "PILGUB"},
    {"nama": "Bupati dan Wakil Bupati", "kode": "PILBUP"}
  ],
  "wilayah": [
    {
      "kecamatan": "ASPARAGA",
      "desaList": [
        {
          "desa": "KARYA INDAH",
          "tpsList": ["001", "002", "003"]
        }
      ]
    }
  ]
}
```

---

### 2. Endpoint: `POST ?action=uploadDocument` (atau POST ke Base URL)
- **Fungsi:** Menerima berkas gabungan (PDF Base64) dari frontend Vercel, menyimpan ke Google Drive terstruktur, dan mencatat log upload ke sheet `Log_Dokumen` beserta data atribusi operator.
- **Method:** `POST`
- **Content-Type:** `text/plain;charset=utf-8` atau `application/json`
- **Request Body Payload (JSON String):**
```json
{
  "action": "uploadDocument",
  "fileName": "Model C-PLANO_DPD-RI_ASPARAGA_KARYA-INDAH_001.pdf",
  "mimeType": "application/pdf",
  "base64Data": "JVBERi0xLjQK...",
  "metadata": {
    "jenisFile": "Model C-Plano",
    "lembaga": "DPD-RI",
    "kecamatan": "ASPARAGA",
    "desa": "KARYA INDAH",
    "tps": "001",
    "totalHalaman": 12,
    "operator": {
      "nama": "Ahmad Fauzi",
      "nip": "198801012022031002",
      "jabatan": "Operator TPS"
    }
  }
}
```
- **Response Format (JSON):**
```json
{
  "status": "success",
  "message": "Dokumen berhasil disimpan ke Google Drive",
  "fileId": "1a2b3c4d5e...",
  "fileUrl": "https://drive.google.com/file/d/...",
  "fileName": "Model C-PLANO_DPD-RI_ASPARAGA_KARYA-INDAH_001.pdf"
}
```

---

### 3. Endpoint: `GET ?action=getMonitoringSummary`
- **Fungsi:** Mengambil rekap status dokumentasi per TPS, menghitung TPS lengkap, belum lengkap, dan kosong (pending).
- **Method:** `GET`
- **URL Parameters:**
  - `action=getMonitoringSummary`
  - `kecamatan` (String, optional, misal: `ASPARAGA`)
  - `desa` (String, optional, misal: `KARYA INDAH`)
- **Response Format (JSON):**
```json
{
  "status": "success",
  "summary": {
    "totalTPS": 1205,
    "lengkap": 850,
    "belumLengkap": 205,
    "kosong": 150
  },
  "records": [
    {
      "kecamatan": "ASPARAGA",
      "desa": "KARYA INDAH",
      "tps": "001",
      "status": "KOSONG",
      "totalUpload": 0,
      "targetTotal": 7,
      "rincian": {
        "PPWP": false,
        "DPR-RI": false,
        "DPD-RI": false,
        "DPRD-PROV": false,
        "DPRD-KAB": false,
        "PILGUB": false,
        "PILBUP": false
      }
    }
  ]
}
```
