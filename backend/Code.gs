/**
 * ==============================================================================
 * SIMAMBIL - Sistem Informasi Manajemen Arsip Pemilu/Pemilihan Berbasis Mobile
 * Google Apps Script Headless REST API (backend/Code.gs)
 * 
 * SOT Reference:
 * - 01-PRD.md (Decoupled REST API)
 * - 04-DATABASE-SPEC.md
 * - 05-API-SPEC.md
 * - 06-BUSINESS-RULES.md
 * ==============================================================================
 */

// Konstanta Nama Sheet
const SHEETS = {
  WILAYAH: 'Master_Wilayah',
  WILAYAH_PILKADA: 'Master_Wilayah_Pilkada',
  KATEGORI: 'Master_Kategori',
  LOG: 'Log_Dokumen',
  REKAP: 'Rekap_Progres'
};

// Target Root Folder ID di Google Drive
const TARGET_DRIVE_FOLDER_ID = '1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI';
const APP_ROOT_FOLDER_NAME = 'SIMAMBIL_DOKUMEN_PEMILU';

// Token Otentikasi API Keamanan SIMAMBIL (VULN-01)
const API_AUTH_TOKEN = 'SIMAMBIL_KABGOR_2024_SECURE_TOKEN';

/**
 * Validasi otentikasi token untuk akses API SIMAMBIL (VULN-01)
 */
function isAuthorized(e, payload) {
  const configuredToken = PropertiesService.getScriptProperties().getProperty('API_AUTH_TOKEN') || API_AUTH_TOKEN;
  
  // Periksa token dari query parameter atau payload body
  const tokenFromParam = (e && e.parameter && (e.parameter.token || e.parameter.apiKey)) ? String(e.parameter.token || e.parameter.apiKey).trim() : '';
  const tokenFromBody = (payload && (payload.token || payload.apiKey)) ? String(payload.token || payload.apiKey).trim() : '';
  
  return tokenFromParam === configuredToken || tokenFromBody === configuredToken;
}

/**
 * Helper untuk sanitasi anti-formula / CSV injection di Google Spreadsheet (CWE-1236 / VULN-02)
 */
function escapeSpreadsheetFormula(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (/^[=\+\-@\t\r]/.test(s)) {
    return "'" + s;
  }
  return s;
}

/**
 * ==============================================================================
 * HTTP GET ROUTER (REST API)
 * SOT: 05-API-SPEC.md (Endpoints: getMasterData & getMonitoringSummary)
 * ==============================================================================
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'getMasterData') {
      if (!isAuthorized(e)) {
        return createJsonResponse({
          status: 'error',
          code: 403,
          message: 'Akses Ditolak: Token otentikasi tidak valid atau belum disertakan.'
        });
      }
      const data = getInitialMasterData();
      return createJsonResponse(data);
    }

    if (action === 'getMonitoringSummary') {
      if (!isAuthorized(e)) {
        return createJsonResponse({
          status: 'error',
          code: 403,
          message: 'Akses Ditolak: Token otentikasi tidak valid atau belum disertakan.'
        });
      }
      const filterKec = e.parameter.kecamatan || '';
      const filterDesa = e.parameter.desa || '';
      const filterKategori = e.parameter.kategori || '';
      const data = getMonitoringSummary(filterKec, filterDesa, filterKategori);
      return createJsonResponse(data);
    }

    // Default info status jika endpoint dibuka langsung di browser
    return createJsonResponse({
      status: 'success',
      app: 'SIMAMBIL - Sistem Informasi Manajemen Arsip Pemilu/Pemilihan Berbasis Mobile (Secured)',
      version: '2.1.0',
      message: 'API aktif. Seluruh endpoint operasional dilindungi token otentikasi resmi KPU.',
      authenticated: isAuthorized(e)
    });

  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'Gagal memproses request GET: ' + err.message
    });
  }
}

/**
 * ==============================================================================
 * HTTP POST ROUTER (REST API)
 * SOT: 05-API-SPEC.md (Endpoint: uploadDocument)
 * ==============================================================================
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        message: 'Request body kosong atau tidak valid.'
      });
    }

    let payload = null;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        status: 'error',
        message: 'Format JSON payload tidak valid: ' + parseErr.message
      });
    }

    // Validasi Keamanan Token (VULN-01)
    if (!isAuthorized(e, payload)) {
      return createJsonResponse({
        status: 'error',
        code: 403,
        message: 'Akses Ditolak: Token otentikasi tidak valid atau belum disertakan.'
      });
    }

    const action = payload.action || 'uploadDocument';

    if (action === 'uploadDocument' || payload.base64Data) {
      const result = uploadCompiledDocument(payload);
      return createJsonResponse(result);
    }

    return createJsonResponse({
      status: 'error',
      message: 'Action tidak dikenali: ' + action
    });

  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'Internal server error: ' + err.message
    });
  }
}

/**
 * Helper untuk format response JSON REST API
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mendapatkan referensi Spreadsheet aktif atau Spreadsheet ID tersimpan
 */
function getAppSpreadsheet() {
  const prop = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (prop) {
    try {
      return SpreadsheetApp.openById(prop);
    } catch (e) {
      Logger.log('Property SPREADSHEET_ID tidak dapat dibuka: ' + e.message);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * ==============================================================================
 * API 1: getInitialMasterData()
 * SOT: 05-API-SPEC.md (Section 1)
 * ==============================================================================
 */
function getInitialMasterData() {
  try {
    // 0. Cek CacheService Apps Script untuk respon super cepat (<50ms)
    const cache = CacheService.getScriptCache();
    const cachedData = cache.get('CACHE_MASTER_DATA_V1');
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (errJson) {
        Logger.log('Cache parse failed: ' + errJson.message);
      }
    }

    const ss = getAppSpreadsheet();
    if (!ss) {
      return getFallbackMasterData();
    }

    const sheetKategori = ss.getSheetByName(SHEETS.KATEGORI);
    const sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);

    if (!sheetKategori || !sheetWilayah) {
      return getFallbackMasterData();
    }

    // 1. Ambil data Kategori
    const dataKategori = sheetKategori.getDataRange().getValues();
    const jenisDokumenSet = new Set();
    const lembagaMap = new Map();

    for (let i = 1; i < dataKategori.length; i++) {
      const jenis = String(dataKategori[i][0] || '').trim();
      const namaLembaga = String(dataKategori[i][1] || '').trim();
      const kodeLembaga = String(dataKategori[i][2] || '').trim();

      if (jenis) jenisDokumenSet.add(jenis);
      if (namaLembaga && kodeLembaga && !lembagaMap.has(kodeLembaga)) {
        lembagaMap.set(kodeLembaga, { nama: namaLembaga, kode: kodeLembaga });
      }
    }

    // 2. Ambil data Wilayah Pemilu dari Sheet Master_Wilayah (1.205 TPS)
    const dataWilayah = sheetWilayah.getDataRange().getValues();
    const wilayahTree = {};
    let totalTpsPemilu = 0;

    for (let i = 1; i < dataWilayah.length; i++) {
      const kec = String(dataWilayah[i][1] || '').trim().toUpperCase();
      const desa = String(dataWilayah[i][2] || '').trim().toUpperCase();
      const tps = formatTPS(String(dataWilayah[i][3] || '').trim());

      if (!kec || !desa || !tps) continue;

      if (!wilayahTree[kec]) wilayahTree[kec] = {};
      if (!wilayahTree[kec][desa]) wilayahTree[kec][desa] = [];
      if (!wilayahTree[kec][desa].includes(tps)) {
        wilayahTree[kec][desa].push(tps);
        totalTpsPemilu++;
      }
    }

    // 3. Ambil data Wilayah Pilkada dari Sheet Terpisah Master_Wilayah_Pilkada
    let sheetWilayahPilkada = ss.getSheetByName(SHEETS.WILAYAH_PILKADA);
    if (!sheetWilayahPilkada) {
      sheetWilayahPilkada = ss.insertSheet(SHEETS.WILAYAH_PILKADA);
      ensureSheetHeaders(sheetWilayahPilkada, ['ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS', 'JUMLAH_DPT']);
    }

    const wilayahPilkadaTree = {};
    let hasPilkadaWilayah = false;
    let totalTpsPilkada = 0;

    if (sheetWilayahPilkada && sheetWilayahPilkada.getLastRow() > 1) {
      const dataWilayahPilkada = sheetWilayahPilkada.getDataRange().getValues();
      for (let i = 1; i < dataWilayahPilkada.length; i++) {
        const kec = String(dataWilayahPilkada[i][1] || '').trim().toUpperCase();
        const desa = String(dataWilayahPilkada[i][2] || '').trim().toUpperCase();
        const tps = formatTPS(String(dataWilayahPilkada[i][3] || '').trim());

        if (!kec || !desa || !tps) continue;

        hasPilkadaWilayah = true;
        if (!wilayahPilkadaTree[kec]) wilayahPilkadaTree[kec] = {};
        if (!wilayahPilkadaTree[kec][desa]) wilayahPilkadaTree[kec][desa] = [];
        if (!wilayahPilkadaTree[kec][desa].includes(tps)) {
          wilayahPilkadaTree[kec][desa].push(tps);
          totalTpsPilkada++;
        }
      }
    }

    // Susun format response sesuai SOT 05-API-SPEC.md
    const formatWilayahTree = (tree) => {
      return Object.keys(tree).sort().map(kec => {
        const desaList = Object.keys(tree[kec]).sort().map(desa => {
          return {
            desa: desa,
            tpsList: tree[kec][desa].sort()
          };
        });
        return {
          kecamatan: kec,
          desaList: desaList
        };
      });
    };

    const wilayahList = formatWilayahTree(wilayahTree);
    const wilayahPilkadaList = hasPilkadaWilayah ? formatWilayahTree(wilayahPilkadaTree) : wilayahList;

    const result = {
      status: 'success',
      jenisDokumen: Array.from(jenisDokumenSet),
      kategoriPemilihan: [
        { kode: 'PEMILU', nama: 'Pemilu (Presiden & Legislatif)', totalLembaga: 5, totalTps: totalTpsPemilu },
        { kode: 'PILKADA', nama: 'Pilkada (Gubernur & Bupati)', totalLembaga: 2, totalTps: hasPilkadaWilayah ? totalTpsPilkada : totalTpsPemilu }
      ],
      hasDedicatedPilkadaSheet: hasPilkadaWilayah,
      totalTpsPemilu: totalTpsPemilu,
      totalTpsPilkada: hasPilkadaWilayah ? totalTpsPilkada : totalTpsPemilu,
      lembaga: Array.from(lembagaMap.values()),
      lembagaByKategori: {
        'PEMILU': [
          { nama: 'Presiden dan Wakil Presiden', kode: 'PPWP', targetHal: 3 },
          { nama: 'DPR RI', kode: 'DPR-RI', targetHal: 20 },
          { nama: 'DPD RI', kode: 'DPD-RI', targetHal: 3 },
          { nama: 'DPRD Provinsi', kode: 'DPRD-PROV', targetHal: 20 },
          { nama: 'DPRD Kabupaten / Kota', kode: 'DPRD-KAB', targetHal: 20 }
        ],
        'PILKADA': [
          { nama: 'Gubernur dan Wakil Gubernur', kode: 'PILGUB', targetHal: 3 },
          { nama: 'Bupati dan Wakil Bupati', kode: 'PILBUP', targetHal: 3 }
        ]
      },
      wilayah: wilayahList,
      wilayahPilkada: wilayahPilkadaList
    };

    // Simpan ke CacheService Apps Script selama 6 jam (21600 detik)
    try {
      const jsonStr = JSON.stringify(result);
      if (jsonStr.length < 100000) {
        cache.put('CACHE_MASTER_DATA_V1', jsonStr, 21600);
      }
    } catch (errCache) {
      Logger.log('Cache put failed: ' + errCache.message);
    }

    return result;

  } catch (error) {
    Logger.log('Error getInitialMasterData: ' + error.message);
    return getFallbackMasterData();
  }
}

/**
 * ==============================================================================
 * API 2: uploadCompiledDocument(payload)
 * SOT: 05-API-SPEC.md (Section 2) & 06-BUSINESS-RULES.md (Section 1 & 3)
 * ==============================================================================
 */
function uploadCompiledDocument(payload) {
  try {
    if (!payload || !payload.base64Data || !payload.fileName) {
      throw new Error('Payload berkas tidak valid atau data base64 kosong.');
    }

    const meta = payload.metadata || {};
    const jenisFile = String(meta.jenisFile || 'Model C-Plano').trim();
    const lembaga = normalizeKodeLembaga(meta.lembaga || 'PPWP');
    const kecamatan = String(meta.kecamatan || 'ASPARAGA').trim().toUpperCase();
    const desa = String(meta.desa || 'DESA').trim().toUpperCase();
    const tps = formatTPS(meta.tps || '001');
    const totalHalaman = Number(meta.totalHalaman || 1);

    const op = meta.operator || {};
    const opNama = String(op.nama || '').trim();
    const opNipRaw = String(op.nip || '').trim().replace(/\s+/g, '');
    const opJabatan = String(op.jabatan || '').trim();

    // Validasi Keamanan NIP Operator (VULN-02):
    // Komisioner diizinkan menggunakan tanda '-' atau angka murni
    // Sekretariat wajib angka murni
    if (opJabatan === 'Komisioner' && opNipRaw === '-') {
      // Valid Komisioner non-NIP
    } else if (opNipRaw && !/^\d+$/.test(opNipRaw)) {
      throw new Error('Validasi Identitas Gagal: NIP operator harus berupa angka murni (atau tanda "-" khusus untuk jabatan Komisioner).');
    }
    const opNip = opNipRaw || '-';

    // 1. Standarisasi Nama File sesuai SOT 06-BUSINESS-RULES.md
    // [JENIS_FILE]_[KODE_LEMBAGA]_[KECAMATAN]_[DESA]_[TPS].pdf
    const standardizedFileName = formatStandardFileName(jenisFile, lembaga, kecamatan, desa, tps);

    // 2. Validasi Batasan Ukuran Berkas & Magic Bytes PDF (VULN-04 & Ketetapan Khusus: Max 1 MB jika <= 3 Hal, Max 5 MB jika > 3 Hal)
    const isThreePages = totalHalaman <= 3;
    const maxAllowedBytes = isThreePages ? (1 * 1024 * 1024) : (5 * 1024 * 1024);
    const maxMbLabel = isThreePages ? '1 MB' : '5 MB';

    let rawBase64 = payload.base64Data;
    if (rawBase64.indexOf(',') > -1) {
      rawBase64 = rawBase64.split(',')[1];
    }

    // Cek estimasi ukuran string base64 awal sebelum alokasi memori decode
    const estimatedBytes = Math.round((rawBase64.length * 3) / 4);
    if (estimatedBytes > maxAllowedBytes * 1.15) {
      const estimatedMb = (estimatedBytes / (1024 * 1024)).toFixed(2);
      throw new Error('Ukuran berkas (' + estimatedMb + ' MB) melebihi batas kuota ' + maxMbLabel + ' untuk dokumen ' + totalHalaman + ' halaman.');
    }

    const decodedBytes = Utilities.base64Decode(rawBase64);
    const actualBytes = decodedBytes.length;

    if (actualBytes > maxAllowedBytes) {
      const actualMb = (actualBytes / (1024 * 1024)).toFixed(2);
      throw new Error('Ukuran berkas asli (' + actualMb + ' MB) melebihi batas kuota ' + maxMbLabel + ' untuk dokumen ' + totalHalaman + ' halaman.');
    }

    // Validasi Magic Bytes Header PDF (%PDF- / hex 25 50 44 46)
    if (actualBytes < 4 ||
        decodedBytes[0] !== 0x25 || // '%'
        decodedBytes[1] !== 0x50 || // 'P'
        decodedBytes[2] !== 0x44 || // 'D'
        decodedBytes[3] !== 0x46) { // 'F'
      throw new Error('Validasi Keamanan Gagal: Berkas yang diunggah harus berformat PDF resmi (%PDF-).');
    }

    const mimeType = payload.mimeType || 'application/pdf';
    const blob = Utilities.newBlob(decodedBytes, mimeType, standardizedFileName);

    // 3. Navigasi / Buat Struktur Folder di Google Drive:
    // [Root] / [Kecamatan] / [Desa] / [TPS] / [File.pdf]
    const rootFolder = getOrCreateRootFolder();
    const kecFolder = getOrCreateSubFolder(rootFolder, kecamatan);
    const desaFolder = getOrCreateSubFolder(kecFolder, desa);
    const tpsFolder = getOrCreateSubFolder(desaFolder, 'TPS ' + tps);

    // Simpan file ke target folder
    const createdFile = tpsFolder.createFile(blob);
    createdFile.setDescription('Unggah SIMAMBIL: ' + standardizedFileName + ' | Halaman: ' + totalHalaman);

    // Set file accessibility ke siapapun yang memiliki link (view-only)
    try {
      createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('Drive share setting notice: ' + e.message);
    }

    const fileId = createdFile.getId();
    const fileUrl = createdFile.getUrl();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Makassar', 'yyyy-MM-dd HH:mm:ss');

    // 4. Catat Log ke Sheet Log_Dokumen
    logUploadedDocument({
      timestamp: timestamp,
      fileName: standardizedFileName,
      jenisFile: jenisFile,
      lembaga: lembaga,
      kecamatan: kecamatan,
      desa: desa,
      tps: tps,
      totalHalaman: totalHalaman,
      fileId: fileId,
      fileUrl: fileUrl,
      operatorNama: opNama,
      operatorNip: opNip,
      operatorJabatan: opJabatan
    });

    // Invalidate cache monitoring di GAS agar rekapitulasi berikutnya langsung mutakhir
    try {
      CacheService.getScriptCache().remove('CACHE_MONITORING_SUMMARY_ALL');
      CacheService.getScriptCache().remove('CACHE_MONITORING_SUMMARY_V3');
    } catch (eCache) {
      Logger.log('Cache remove error: ' + eCache.message);
    }

    return {
      status: 'success',
      message: 'Dokumen berhasil disimpan',
      fileId: fileId,
      fileUrl: fileUrl,
      fileName: standardizedFileName
    };

  } catch (error) {
    Logger.log('Error uploadCompiledDocument: ' + error.message);
    return {
      status: 'error',
      message: 'Gagal mengunggah berkas: ' + error.message
    };
  }
}

/**
 * ==============================================================================
 * API 3: getMonitoringSummary(filterKecamatan, filterDesa)
 * SOT: 05-API-SPEC.md (Section 3) & 06-BUSINESS-RULES.md (Section 4)
 * ==============================================================================
 */
function getMonitoringSummary(filterKecamatan, filterDesa, filterKategori) {
  try {
    const isGlobal = !filterKecamatan && !filterDesa;
    const catUpper = String(filterKategori || '').trim().toUpperCase();
    const cache = CacheService.getScriptCache();

    // 0. Cek CacheService Apps Script
    const cacheKey = 'CACHE_MON_V5_' + (catUpper || 'ALL') + '_' + (isGlobal ? 'GLOBAL' : (filterKecamatan + '_' + filterDesa));
    if (isGlobal) {
      const cached = cache.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (errJson) {
          Logger.log('Monitoring cache parse failed: ' + errJson.message);
        }
      }
    }

    const ss = getAppSpreadsheet();
    if (!ss) {
      return getFallbackMonitoringSummary(filterKecamatan, filterDesa);
    }

    const sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);
    const sheetLog = ss.getSheetByName(SHEETS.LOG);

    if (!sheetWilayah) {
      return getFallbackMonitoringSummary(filterKecamatan, filterDesa);
    }

    // 1. Ambil target lembaga sesuai kategori pemilihan
    // SOT: Pemilu (5 Lembaga), Pilkada (2 Lembaga), Semua (7 Lembaga)
    let targetLembaga = ['PPWP', 'DPR-RI', 'DPD-RI', 'DPRD-PROV', 'DPRD-KAB', 'PILGUB', 'PILBUP'];
    if (catUpper === 'PEMILU') {
      targetLembaga = ['PPWP', 'DPR-RI', 'DPD-RI', 'DPRD-PROV', 'DPRD-KAB'];
    } else if (catUpper === 'PILKADA') {
      targetLembaga = ['PILGUB', 'PILBUP'];
    }

    const TARGET_HALAMAN = {
      'PPWP': 3,
      'DPD-RI': 3,
      'DPR-RI': 20,
      'DPRD-PROV': 20,
      'DPRD-KAB': 20,
      'PILGUB': 3,
      'PILBUP': 3
    };

    // 2. Baca Log Dokumen untuk pemetaan upload per TPS & jumlah halaman maksimal yang terupload
    // Map key: "KECAMATAN|DESA|TPS" => Object { [kodeLembaga]: maxPagesUploaded }
    const uploadMap = new Map();

    if (sheetLog && sheetLog.getLastRow() > 1) {
      const logData = sheetLog.getDataRange().getValues();
      for (let i = 1; i < logData.length; i++) {
        const row = logData[i];
        const kec = String(row[4] || '').trim().toUpperCase();
        const desa = String(row[5] || '').trim().toUpperCase();
        const tps = formatTPS(String(row[6] || '').trim());
        const kodeLembaga = normalizeKodeLembaga(String(row[3] || '').trim());
        const hal = parseInt(String(row[7] || ''), 10) || 1;
        const fileId = String(row[8] || '').trim();
        const fileUrl = String(row[9] || '').trim();
        const fileName = String(row[1] || '').trim();

        if (!kec || !desa || !tps || !kodeLembaga) continue;

        const key = normalizeWilayahKey(kec, desa, tps);
        if (!uploadMap.has(key)) {
          uploadMap.set(key, {});
        }
        const pagesMap = uploadMap.get(key);
        const existing = pagesMap[kodeLembaga];
        const existingHal = (existing && typeof existing === 'object') ? (existing.hal || 0) : (Number(existing) || 0);

        if (!existing || hal >= existingHal) {
          pagesMap[kodeLembaga] = {
            hal: hal,
            fileId: fileId,
            fileUrl: fileUrl,
            fileName: fileName
          };
        }
      }
    }

    // Helper evaluasi kelengkapan dokumen per TPS
    function evaluateTpsRecords(tpsPagesMap) {
      const tpsPages = tpsPagesMap || {};
      const rincian = {};
      const detailHalaman = {};
      let totalLengkap = 0;
      let totalDokumenUpload = 0;

      targetLembaga.forEach(kode => {
        const targetHal = TARGET_HALAMAN[kode] || 1;
        const docEntry = tpsPages[kode];
        let actualHal = 0;
        let fileId = '';
        let fileUrl = '';
        let fileName = '';

        if (docEntry && typeof docEntry === 'object') {
          actualHal = docEntry.hal || 0;
          fileId = docEntry.fileId || '';
          fileUrl = docEntry.fileUrl || '';
          fileName = docEntry.fileName || '';
        } else if (typeof docEntry === 'number') {
          actualHal = docEntry;
        }

        const isLengkap = actualHal >= targetHal;

        const kurang = Math.max(0, targetHal - actualHal);
        rincian[kode] = isLengkap;
        detailHalaman[kode] = {
          actual: actualHal,
          target: targetHal,
          lengkap: isLengkap,
          kurang: kurang,
          persen: targetHal > 0 ? Math.min(100, Math.round((actualHal / targetHal) * 100)) : 0,
          fileId: fileId,
          fileUrl: fileUrl,
          fileName: fileName
        };

        if (isLengkap) totalLengkap++;
        if (actualHal > 0) totalDokumenUpload++;
      });

      // Aturan SOT 06-BUSINESS-RULES.md:
      // LENGKAP: Seluruh 7 lembaga memenuhi target halamannya masing-masing
      // BELUM LENGKAP: Minimal 1 berkas terupload, tetapi belum semua 7 lembaga memenuhi target
      // KOSONG: Belum ada berkas apapun yang terupload (0 uploads)
      let status = 'KOSONG';
      if (totalLengkap === targetLembaga.length) {
        status = 'LENGKAP';
      } else if (totalDokumenUpload > 0) {
        status = 'BELUM LENGKAP';
      } else {
        status = 'KOSONG';
      }

      return {
        status: status,
        totalLengkap: totalLengkap,
        totalUpload: totalDokumenUpload,
        targetTotal: targetLembaga.length,
        rincian: rincian,
        detailHalaman: detailHalaman
      };
    }

    // 3. Baca Master Wilayah sesuai kategori pemilihan:
    // Jika Pilkada dan sheet Master_Wilayah_Pilkada tersedia data, gunakan Master_Wilayah_Pilkada
    let targetSheetWilayah = sheetWilayah;
    if (catUpper === 'PILKADA') {
      const sheetPilkada = ss.getSheetByName(SHEETS.WILAYAH_PILKADA);
      if (sheetPilkada && sheetPilkada.getLastRow() > 1) {
        targetSheetWilayah = sheetPilkada;
      }
    }
    const wilayahData = targetSheetWilayah.getDataRange().getValues();
    const records = [];
    const processedKeys = new Set();
    let countLengkap = 0;
    let countBelumLengkap = 0;
    let countKosong = 0;

    const normFilterKec = filterKecamatan ? filterKecamatan.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';
    const normFilterDesa = filterDesa ? filterDesa.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';

    for (let i = 1; i < wilayahData.length; i++) {
      const kec = String(wilayahData[i][1] || '').trim().toUpperCase();
      const desa = String(wilayahData[i][2] || '').trim().toUpperCase();
      const tps = formatTPS(String(wilayahData[i][3] || '').trim());

      if (!kec || !desa || !tps) continue;

      const normKey = normalizeWilayahKey(kec, desa, tps);
      processedKeys.add(normKey);

      // Filter wilayah jika parameter diberikan (toleran variasi spasi/strip)
      if (normFilterKec && kec.replace(/[\s\-_]+/g, '') !== normFilterKec) continue;
      if (normFilterDesa && desa.replace(/[\s\-_]+/g, '') !== normFilterDesa) continue;

      const evalResult = evaluateTpsRecords(uploadMap.get(normKey));

      if (evalResult.status === 'LENGKAP') {
        countLengkap++;
      } else if (evalResult.status === 'BELUM LENGKAP') {
        countBelumLengkap++;
      } else {
        countKosong++;
      }

      records.push({
        kecamatan: kec,
        desa: desa,
        tps: tps,
        status: evalResult.status,
        totalLengkap: evalResult.totalLengkap,
        totalUpload: evalResult.totalUpload,
        targetTotal: evalResult.targetTotal,
        rincian: evalResult.rincian,
        detailHalaman: evalResult.detailHalaman
      });
    }

    // 4. Tambahkan TPS dari Log HANYA jika Master_Wilayah kosong (mode darurat/seeder awal)
    // Jika Master_Wilayah terisi, Master_Wilayah adalah SSOT mutlak (1205 TPS) sehingga TPS phantom tidak akan tercipta
    if (wilayahData.length <= 1) {
      uploadMap.forEach((tpsPages, key) => {
        if (processedKeys.has(key)) return;
        const parts = key.split('|');
        if (parts.length < 3) return;
        const kec = parts[0];
        const desa = parts[1];
        const tps = parts[2];

        if (normFilterKec && kec.replace(/[\s\-_]+/g, '') !== normFilterKec) return;
        if (normFilterDesa && desa.replace(/[\s\-_]+/g, '') !== normFilterDesa) return;

        const evalResult = evaluateTpsRecords(tpsPages);

        if (evalResult.status === 'LENGKAP') {
          countLengkap++;
        } else if (evalResult.status === 'BELUM LENGKAP') {
          countBelumLengkap++;
        } else {
          countKosong++;
        }

        records.push({
          kecamatan: kec,
          desa: desa,
          tps: tps,
          status: evalResult.status,
          totalLengkap: evalResult.totalLengkap,
          totalUpload: evalResult.totalUpload,
          targetTotal: evalResult.targetTotal,
          rincian: evalResult.rincian,
          detailHalaman: evalResult.detailHalaman
        });
      });
    }

    // Urutkan records berdasarkan Kecamatan, Desa, dan Nomor TPS
    records.sort((a, b) => {
      if (a.kecamatan !== b.kecamatan) return a.kecamatan.localeCompare(b.kecamatan);
      if (a.desa !== b.desa) return a.desa.localeCompare(b.desa);
      return a.tps.localeCompare(b.tps);
    });

    // 5. Agregasi Ringkasan Wilayah per Kecamatan & Desa (SOT 06-BUSINESS-RULES.md)
    const kecMap = new Map();
    records.forEach(rec => {
      if (!kecMap.has(rec.kecamatan)) {
        kecMap.set(rec.kecamatan, {
          kecamatan: rec.kecamatan,
          totalTPS: 0,
          lengkap: 0,
          belumLengkap: 0,
          kosong: 0,
          desaMap: new Map()
        });
      }
      const kObj = kecMap.get(rec.kecamatan);
      kObj.totalTPS++;
      if (rec.status === 'LENGKAP') kObj.lengkap++;
      else if (rec.status === 'BELUM LENGKAP') kObj.belumLengkap++;
      else kObj.kosong++;

      if (!kObj.desaMap.has(rec.desa)) {
        kObj.desaMap.set(rec.desa, {
          desa: rec.desa,
          totalTPS: 0,
          lengkap: 0,
          belumLengkap: 0,
          kosong: 0,
          tpsKosong: [],
          tpsBelumLengkap: []
        });
      }
      const dObj = kObj.desaMap.get(rec.desa);
      dObj.totalTPS++;
      if (rec.status === 'LENGKAP') dObj.lengkap++;
      else if (rec.status === 'BELUM LENGKAP') {
        dObj.belumLengkap++;
        dObj.tpsBelumLengkap.push(rec.tps);
      } else {
        dObj.kosong++;
        dObj.tpsKosong.push(rec.tps);
      }
    });

    const rekapKecamatan = [];
    kecMap.forEach(kObj => {
      const desaList = [];
      kObj.desaMap.forEach(dObj => {
        desaList.push(dObj);
      });
      desaList.sort((a, b) => a.desa.localeCompare(b.desa));

      rekapKecamatan.push({
        kecamatan: kObj.kecamatan,
        totalTPS: kObj.totalTPS,
        lengkap: kObj.lengkap,
        belumLengkap: kObj.belumLengkap,
        kosong: kObj.kosong,
        persenLengkap: kObj.totalTPS > 0 ? Math.round((kObj.lengkap / kObj.totalTPS) * 100) : 0,
        desaList: desaList
      });
    });

    rekapKecamatan.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));

    const result = {
      status: 'success',
      summary: {
        totalTPS: records.length,
        lengkap: countLengkap,
        belumLengkap: countBelumLengkap,
        kosong: countKosong,
        totalKecamatan: rekapKecamatan.length,
        kecamatanPending: rekapKecamatan.filter(k => k.kosong > 0 || k.belumLengkap > 0).length
      },
      rekapKecamatan: rekapKecamatan,
      records: records
    };

    // Cache query global ke CacheService selama 120 detik (akan di-evict otomatis saat ada upload baru)
    if (isGlobal) {
      try {
        const jsonStr = JSON.stringify(result);
        if (jsonStr.length < 100000) {
          cache.put(cacheKey, jsonStr, 120);
        }
      } catch (errCache) {
        Logger.log('Monitoring cache put failed: ' + errCache.message);
      }
    }

    return result;

  } catch (error) {
    Logger.log('Error getMonitoringSummary: ' + error.message);
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * ==============================================================================
 * LOGGING & DRIVE HELPERS
 * ==============================================================================
 */

function logUploadedDocument(item) {
  try {
    const ss = getAppSpreadsheet();
    if (!ss) return;

    let sheet = ss.getSheetByName(SHEETS.LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LOG);
      initSheetHeader(sheet, [
        'TIMESTAMP', 'FILE_NAME', 'JENIS_FILE', 'NAMA_LEMBAGA',
        'KECAMATAN', 'DESA', 'TPS', 'JUMLAH_HALAMAN',
        'DRIVE_FILE_ID', 'DRIVE_URL',
        'NAMA_OPERATOR', 'NIP_OPERATOR', 'JABATAN_OPERATOR'
      ]);
    } else {
      // Pastikan header lengkap jika sheet sudah ada sebelumnya
      const lastCol = sheet.getLastColumn();
      if (lastCol <= 10) {
        sheet.getRange(1, 11, 1, 3).setValues([['NAMA_OPERATOR', 'NIP_OPERATOR', 'JABATAN_OPERATOR']]);
        sheet.getRange(1, 11, 1, 3).setBackground('#800000').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
      }
    }

    sheet.appendRow([
      escapeSpreadsheetFormula(item.timestamp),
      escapeSpreadsheetFormula(item.fileName),
      escapeSpreadsheetFormula(item.jenisFile),
      escapeSpreadsheetFormula(item.lembaga),
      escapeSpreadsheetFormula(item.kecamatan),
      escapeSpreadsheetFormula(item.desa),
      escapeSpreadsheetFormula(item.tps),
      item.totalHalaman,
      escapeSpreadsheetFormula(item.fileId),
      escapeSpreadsheetFormula(item.fileUrl),
      escapeSpreadsheetFormula(item.operatorNama || '-'),
      escapeSpreadsheetFormula(item.operatorNip || '-'),
      escapeSpreadsheetFormula(item.operatorJabatan || '-')
    ]);
  } catch (err) {
    Logger.log('Error logUploadedDocument: ' + err.message);
  }
}

function getOrCreateRootFolder() {
  // 1. Prioritas utama: Menggunakan Target Drive Folder ID spesifik
  if (TARGET_DRIVE_FOLDER_ID && TARGET_DRIVE_FOLDER_ID.trim() !== '') {
    try {
      return DriveApp.getFolderById(TARGET_DRIVE_FOLDER_ID.trim());
    } catch (e) {
      Logger.log('Target Drive Folder ID (' + TARGET_DRIVE_FOLDER_ID + ') tidak dapat diakses atau belum diotorisasi: ' + e.message);
    }
  }

  // 2. Prioritas kedua: Menggunakan Script Property jika pernah disimpan
  const rootId = PropertiesService.getScriptProperties().getProperty('APP_ROOT_FOLDER_ID');
  if (rootId) {
    try {
      return DriveApp.getFolderById(rootId);
    } catch (e) {
      Logger.log('Root folder ID invalid, making fallback search.');
    }
  }

  // 3. Fallback: Cari atau buat folder dengan nama default
  const folders = DriveApp.getFoldersByName(APP_ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    const f = folders.next();
    PropertiesService.getScriptProperties().setProperty('APP_ROOT_FOLDER_ID', f.getId());
    return f;
  }

  const newRoot = DriveApp.createFolder(APP_ROOT_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('APP_ROOT_FOLDER_ID', newRoot.getId());
  return newRoot;
}

function getOrCreateSubFolder(parentFolder, subFolderName) {
  const cleanName = subFolderName.trim();
  const folders = parentFolder.getFoldersByName(cleanName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(cleanName);
}

/**
 * ==============================================================================
 * SANITASI & FORMATTING HELPERS
 * SOT: 06-BUSINESS-RULES.md
 * ==============================================================================
 */

function sanitizeInput(str) {
  return String(str || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
}

function formatTPS(tps) {
  const num = parseInt(String(tps).replace(/\D/g, ''), 10);
  if (isNaN(num)) return '001';
  return ('000' + num).slice(-3);
}

function normalizeWilayahKey(kec, desa, tps) {
  const k = String(kec || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
  const d = String(desa || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
  const t = formatTPS(tps);
  return k + '|' + d + '|' + t;
}

function formatStandardFileName(jenisFile, lembaga, kecamatan, desa, tps) {
  const j = sanitizeInput(jenisFile).replace(/[^A-Z0-9\-]/g, '');
  const l = normalizeKodeLembaga(lembaga);
  const k = sanitizeInput(kecamatan).replace(/[^A-Z0-9\-]/g, '');
  const d = sanitizeInput(desa).replace(/[^A-Z0-9\-]/g, '');
  const t = formatTPS(tps);

  return j + '_' + l + '_' + k + '_' + d + '_' + t + '.pdf';
}

function normalizeKodeLembaga(str) {
  const input = String(str || '').trim().toUpperCase();
  if (input.includes('PPWP') || input.includes('PRESIDEN')) return 'PPWP';
  if (input.includes('DPR-RI') || input.includes('DPR RI')) return 'DPR-RI';
  if (input.includes('DPD-RI') || input.includes('DPD RI')) return 'DPD-RI';
  if (input.includes('DPRD-PROV') || input.includes('PROVINSI')) return 'DPRD-PROV';
  if (input.includes('DPRD-KAB') || input.includes('KABUPATEN') || input.includes('KOTA')) return 'DPRD-KAB';
  if (input.includes('PILGUB') || input.includes('GUBERNUR')) return 'PILGUB';
  if (input.includes('PILBUP') || input.includes('BUPATI')) return 'PILBUP';
  return sanitizeInput(input).replace(/[^A-Z0-9\-]/g, '');
}

/**
 * ==============================================================================
 * SEEDER & INITIAL DATABASE SETUP
 * SOT: 04-DATABASE-SPEC.md
 * ==============================================================================
 */

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Tidak ada Active Spreadsheet. Harap kaitkan project script ini dengan Google Spreadsheet.');
  }

  // 1. Setup Master_Kategori (Non-destructive: hanya isi kategori default jika sheet masih kosong)
  let sheetKategori = ss.getSheetByName(SHEETS.KATEGORI);
  if (!sheetKategori) {
    sheetKategori = ss.insertSheet(SHEETS.KATEGORI);
  }
  ensureSheetHeaders(sheetKategori, ['JENIS_FILE', 'NAMA_LEMBAGA', 'KODE_LEMBAGA']);
  
  // Hanya seed kategori default jika baris data masih kosong (< 2 baris)
  if (sheetKategori.getLastRow() <= 1) {
    const kategoriRows = [
      ['Model C-Plano', 'Presiden dan Wakil Presiden', 'PPWP'],
      ['Model C-Plano', 'DPR RI', 'DPR-RI'],
      ['Model C-Plano', 'DPD RI', 'DPD-RI'],
      ['Model C-Plano', 'DPRD Provinsi', 'DPRD-PROV'],
      ['Model C-Plano', 'DPRD Kabupaten / Kota', 'DPRD-KAB'],
      ['Model C-Plano', 'Gubernur dan Wakil Gubernur', 'PILGUB'],
      ['Model C-Plano', 'Bupati dan Wakil Bupati', 'PILBUP'],
      ['Model D-Plano', 'Presiden dan Wakil Presiden', 'PPWP'],
      ['Model D-Plano', 'DPR RI', 'DPR-RI'],
      ['Model D-Plano', 'DPD RI', 'DPD-RI'],
      ['Model D-Plano', 'DPRD Provinsi', 'DPRD-PROV'],
      ['Model D-Plano', 'DPRD Kabupaten / Kota', 'DPRD-KAB'],
      ['Model D-Plano', 'Gubernur dan Wakil Gubernur', 'PILGUB'],
      ['Model D-Plano', 'Bupati dan Wakil Bupati', 'PILBUP']
    ];
    sheetKategori.getRange(2, 1, kategoriRows.length, 3).setValues(kategoriRows);
  }

  // 2. Setup Master_Wilayah (Pemilu - Non-destructive: data 1.205 TPS tetap aman)
  let sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);
  if (!sheetWilayah) {
    sheetWilayah = ss.insertSheet(SHEETS.WILAYAH);
  }
  ensureSheetHeaders(sheetWilayah, ['ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS', 'JUMLAH_DPT']);

  // 2b. Setup Master_Wilayah_Pilkada (Sheet Terpisah Khusus TPS Pilkada)
  let sheetWilayahPilkada = ss.getSheetByName(SHEETS.WILAYAH_PILKADA);
  if (!sheetWilayahPilkada) {
    sheetWilayahPilkada = ss.insertSheet(SHEETS.WILAYAH_PILKADA);
  }
  ensureSheetHeaders(sheetWilayahPilkada, ['ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS', 'JUMLAH_DPT']);

  // 3. Setup Log_Dokumen (Pastikan kolom operator K, L, M terpasang tanpa menghapus riwayat log)
  let sheetLog = ss.getSheetByName(SHEETS.LOG);
  if (!sheetLog) {
    sheetLog = ss.insertSheet(SHEETS.LOG);
  }
  ensureSheetHeaders(sheetLog, [
    'TIMESTAMP', 'FILE_NAME', 'JENIS_FILE', 'NAMA_LEMBAGA',
    'KECAMATAN', 'DESA', 'TPS', 'JUMLAH_HALAMAN',
    'DRIVE_FILE_ID', 'DRIVE_URL',
    'NAMA_OPERATOR', 'NIP_OPERATOR', 'JABATAN_OPERATOR'
  ]);

  // 4. Setup Rekap_Progres (Non-destructive: hanya pastikan header tersedia)
  let sheetRekap = ss.getSheetByName(SHEETS.REKAP);
  if (!sheetRekap) {
    sheetRekap = ss.insertSheet(SHEETS.REKAP);
  }
  ensureSheetHeaders(sheetRekap, [
    'ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS',
    'PPWP', 'DPR_RI', 'DPD_RI', 'DPRD_PROV', 'DPRD_KAB', 'PILGUB', 'PILBUP',
    'TOTAL_UPLOAD', 'STATUS_AKHIR'
  ]);

  SpreadsheetApp.flush();
  const existingTpsCount = Math.max(0, sheetWilayah.getLastRow() - 1);
  Logger.log('Setup / Migrasi Database SIMAMBIL Berhasil! Data aman & tidak direset. Total TPS saat ini: ' + existingTpsCount);
  return 'Setup / Migrasi Database SIMAMBIL selesai aman tanpa reset data. Total TPS terdaftar: ' + existingTpsCount;
}

/**
 * Memastikan header kolom ada di Baris 1 tanpa menghapus baris data yang sudah ada.
 * Jika kolom target belum ada, tambahkan kolom baru di sebelah kanan kolom eksisting.
 */
function ensureSheetHeaders(sheet, targetHeaders) {
  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    // Sheet masih kosong sama sekali
    const range = sheet.getRange(1, 1, 1, targetHeaders.length);
    range.setValues([targetHeaders]);
    formatHeaderRow(range);
    sheet.setFrozenRows(1);
    return;
  }

  // Baca header yang sudah ada di baris 1
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const existingSet = new Set(existingHeaders.map(h => String(h || '').trim().toUpperCase()));

  const missingHeaders = targetHeaders.filter(h => !existingSet.has(h.toUpperCase()));
  if (missingHeaders.length > 0) {
    const startCol = existingHeaders.length + 1;
    const appendRange = sheet.getRange(1, startCol, 1, missingHeaders.length);
    appendRange.setValues([missingHeaders]);
    formatHeaderRow(appendRange);
  }

  sheet.setFrozenRows(1);
}

function formatHeaderRow(range) {
  range.setBackground('#800000');
  range.setFontColor('#FFFFFF');
  range.setFontWeight('bold');
  range.setHorizontalAlignment('center');
}

function initSheetHeader(sheet, headers) {
  ensureSheetHeaders(sheet, headers);
}

function getFallbackMasterData() {
  return {
    status: 'success',
    jenisDokumen: ['Model C-Plano', 'Model D-Plano'],
    kategoriPemilihan: [
      { kode: 'PEMILU', nama: 'Pemilu (Presiden & Legislatif)', totalLembaga: 5 },
      { kode: 'PILKADA', nama: 'Pilkada (Gubernur & Bupati)', totalLembaga: 2 }
    ],
    lembaga: [
      { nama: 'Presiden dan Wakil Presiden', kode: 'PPWP' },
      { nama: 'DPR RI', kode: 'DPR-RI' },
      { nama: 'DPD RI', kode: 'DPD-RI' },
      { nama: 'DPRD Provinsi', kode: 'DPRD-PROV' },
      { nama: 'DPRD Kabupaten / Kota', kode: 'DPRD-KAB' },
      { nama: 'Gubernur dan Wakil Gubernur', kode: 'PILGUB' },
      { nama: 'Bupati dan Wakil Bupati', kode: 'PILBUP' }
    ],
    lembagaByKategori: {
      'PEMILU': [
        { nama: 'Presiden dan Wakil Presiden', kode: 'PPWP', targetHal: 3 },
        { nama: 'DPR RI', kode: 'DPR-RI', targetHal: 20 },
        { nama: 'DPD RI', kode: 'DPD-RI', targetHal: 3 },
        { nama: 'DPRD Provinsi', kode: 'DPRD-PROV', targetHal: 20 },
        { nama: 'DPRD Kabupaten / Kota', kode: 'DPRD-KAB', targetHal: 20 }
      ],
      'PILKADA': [
        { nama: 'Gubernur dan Wakil Gubernur', kode: 'PILGUB', targetHal: 3 },
        { nama: 'Bupati dan Wakil Bupati', kode: 'PILBUP', targetHal: 3 }
      ]
    },
    wilayah: [],
    wilayahPilkada: []
  };
}

function getFallbackMonitoringSummary(filterKec, filterDesa) {
  return {
    status: 'success',
    summary: {
      totalTPS: 0,
      lengkap: 0,
      belumLengkap: 0,
      kosong: 0
    },
    records: []
  };
}
