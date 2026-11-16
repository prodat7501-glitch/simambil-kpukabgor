# DOKUMEN 08: LAPORAN AUDIT KEAMANAN & PENETRATION TESTING
## Sistem Informasi Manajemen Administrasi Berkas Pemilu (SIMAMBIL)
### Komisi Pemilihan Umum (KPU) Kabupaten Gorontalo

---

**Tanggal Pengujian:** 16 November 2026  
**Status Audit:** Selesai (White-box SAST, Threat Modeling STRIDE & OWASP Top 10)  
**Cakupan (Scope):** Frontend PWA, Vercel Serverless Function Proxy (`/api/gas`), Backend Headless Google Apps Script (`backend/Code.gs`), Google Sheets, dan Google Drive.

---

### 1. Ringkasan Eksekutif
Aplikasi SIMAMBIL telah diaudit secara menyeluruh untuk mendeteksi potensi kerentanan keamanan kode sumber, arsitektur data, dan kontrol akses. Status risiko arsitektur dinilai **SEDANG (Medium - High Attention)** dengan temuan utama pada mekanisme autentikasi publik tanpa token, potensi *Formula Injection* pada Google Sheets, izin publik berkas Google Drive, dan ketiadaan pembatasan ukuran payload upload.

### 2. Matriks Temuan Kerentanan

| ID | Kerentanan | Keparahan | Vektor OWASP | Komponen Terdampak |
| :--- | :--- | :---: | :---: | :--- |
| **VULN-01** | Broken Access Control (Unauthenticated Public API) | **TINGGI** | A01:2021 | `backend/Code.gs`, `frontend/api/gas.js` |
| **VULN-02** | Operator Identity Spoofing (Client-Side Trust) | **SEDANG** | A07:2021 | `frontend/app.js` |
| **VULN-03** | Google Sheets Formula / CSV Injection (CWE-1236) | **SEDANG** | A03:2021 | `backend/Code.gs` (`logUploadedDocument`) |
| **VULN-04** | Unrestricted File Upload & Storage Exhaustion (DoS) | **SEDANG** | A04:2021 | `backend/Code.gs` (`uploadCompiledDocument`) |
| **VULN-05** | Sensitive Document Exposure (Public Google Drive Link) | **SEDANG** | A05:2021 | `backend/Code.gs` (`createdFile.setSharing`) |
| **VULN-06** | Permissive CORS Wildcard & Proxy Abuse | **RENDAH** | A05:2021 | `frontend/api/gas.js` |
| **VULN-07** | Potential DOM Attribute Injection via Inline Events | **RENDAH** | A03:2021 | `frontend/app.js` (`escapeJs` in `onclick`) |

---

### 3. Aspek Keamanan Positif yang Sudah Berjalan
1. **Pencegahan XSS:** Fungsi `escapeHtml()` diterapkan secara konsisten pada seluruh penulisan dinamis ke `innerHTML`.
2. **Karantina Path Traversal:** Fungsi `sanitizeInput()` membuang karakter non-alfanumerik (`/[^A-Z0-9\-]/g`), mencegah manipulasi traversal path folder Google Drive.
3. **Pemberantasan Attack Surface Konfigurasi:** Tombol input URL endpoint telah dicopot dari UI sehingga pengguna lapangan tidak dapat mengubah endpoint.
4. **Isolasi Folder:** Hirarki otomatis `Kecamatan/Desa/TPS` mencegah tabrakan berkas antar TPS.

---

### 4. Rekomendasi Mitigasi Teknis

#### A. Mitigasi Formula Injection (CWE-1236)
Tambahkan sanitasi karakter awal pada `backend/Code.gs`:
```javascript
function escapeSpreadsheetFormula(val) {
  const s = String(val || '');
  if (/^[=\+\-@\t\r]/.test(s)) {
    return "'" + s;
  }
  return s;
}
```

#### B. Mitigasi File Upload & Buffer Overflow
Di `backend/Code.gs`:
```javascript
// Batasi ukuran base64 maksimal 20 MB (string length ~28jt karakter)
if (payload.base64Data.length > 28000000) {
  throw new Error('Ukuran berkas melebihi batas maksimum 20MB.');
}
```

#### C. Pengetatan CORS pada Proxy Vercel (`api/gas.js`)
```javascript
const origin = req.headers.origin || '';
if (origin.includes('simambil-kabgor.vercel.app') || origin.includes('localhost')) {
  res.setHeader('Access-Control-Allow-Origin', origin);
}
```

#### D. Pengamanan Hak Akses Google Drive
Ganti `ANYONE_WITH_LINK` pada `createdFile.setSharing` agar tidak membuka file ke seluruh publik internet, melainkan dibatasi pada domain resmi KPU atau membiarkan folder induk mengontrol hak aksesnya.
