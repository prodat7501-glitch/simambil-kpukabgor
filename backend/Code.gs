/**
 * ==============================================================================
 * SISTEM INFORMASI DOKUMENTASI & REKAPITULASI PEMILU (SIMAMBIL)
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
  KATEGORI: 'Master_Kategori',
  LOG: 'Log_Dokumen',
  REKAP: 'Rekap_Progres'
};

// Root Folder Name di Google Drive
const APP_ROOT_FOLDER_NAME = 'SIMAMBIL_DOKUMEN_PEMILU';

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
      const data = getInitialMasterData();
      return createJsonResponse(data);
    }

    if (action === 'getMonitoringSummary') {
      const filterKec = e.parameter.kecamatan || '';
      const filterDesa = e.parameter.desa || '';
      const data = getMonitoringSummary(filterKec, filterDesa);
      return createJsonResponse(data);
    }

    // Default info status jika endpoint dibuka langsung di browser
    return createJsonResponse({
      status: 'success',
      app: 'SIMAMBIL - Dokumentasi Kamera Pemilu REST API',
      version: '2.0.0',
      message: 'API aktif dan siap melayani permintaan frontend Vercel.',
      endpoints: [
        'GET ?action=getMasterData',
        'GET ?action=getMonitoringSummary&kecamatan=[KEC]&desa=[DESA]',
        'POST (uploadDocument payload)'
      ]
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

    // 2. Ambil data Wilayah berjenjang (Kecamatan -> Desa -> TPS)
    const dataWilayah = sheetWilayah.getDataRange().getValues();
    const wilayahTree = {};

    for (let i = 1; i < dataWilayah.length; i++) {
      const kec = String(dataWilayah[i][1] || '').trim().toUpperCase();
      const desa = String(dataWilayah[i][2] || '').trim().toUpperCase();
      const tps = formatTPS(String(dataWilayah[i][3] || '').trim());

      if (!kec || !desa || !tps) continue;

      if (!wilayahTree[kec]) {
        wilayahTree[kec] = {};
      }
      if (!wilayahTree[kec][desa]) {
        wilayahTree[kec][desa] = [];
      }
      if (!wilayahTree[kec][desa].includes(tps)) {
        wilayahTree[kec][desa].push(tps);
      }
    }

    // Susun format response sesuai SOT 05-API-SPEC.md
    const wilayahList = Object.keys(wilayahTree).sort().map(kec => {
      const desaList = Object.keys(wilayahTree[kec]).sort().map(desa => {
        return {
          desa: desa,
          tpsList: wilayahTree[kec][desa].sort()
        };
      });
      return {
        kecamatan: kec,
        desaList: desaList
      };
    });

    return {
      status: 'success',
      jenisDokumen: Array.from(jenisDokumenSet),
      lembaga: Array.from(lembagaMap.values()),
      wilayah: wilayahList
    };

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
    const jenisFile = sanitizeInput(meta.jenisFile || 'Model C-Plano');
    const lembaga = sanitizeInput(meta.lembaga || 'PPWP');
    const kecamatan = sanitizeInput(meta.kecamatan || 'ASPARAGA');
    const desa = sanitizeInput(meta.desa || 'DESA');
    const tps = formatTPS(meta.tps || '001');
    const totalHalaman = Number(meta.totalHalaman || 1);

    // 1. Standarisasi Nama File sesuai SOT 06-BUSINESS-RULES.md
    // [JENIS_FILE]_[KODE_LEMBAGA]_[KECAMATAN]_[DESA]_[TPS].pdf
    const standardizedFileName = formatStandardFileName(jenisFile, lembaga, kecamatan, desa, tps);

    // 2. Decode Base64 Data
    let rawBase64 = payload.base64Data;
    if (rawBase64.indexOf(',') > -1) {
      rawBase64 = rawBase64.split(',')[1];
    }
    const decodedBytes = Utilities.base64Decode(rawBase64);
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
      fileUrl: fileUrl
    });

    return {
      status: 'success',
      message: 'Dokumen berhasil disimpan ke Google Drive',
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
function getMonitoringSummary(filterKecamatan, filterDesa) {
  try {
    const ss = getAppSpreadsheet();
    if (!ss) {
      return getFallbackMonitoringSummary(filterKecamatan, filterDesa);
    }

    const sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);
    const sheetLog = ss.getSheetByName(SHEETS.LOG);

    if (!sheetWilayah) {
      return getFallbackMonitoringSummary(filterKecamatan, filterDesa);
    }

    // 1. Ambil daftar target 7 Lembaga
    const targetLembaga = ['PPWP', 'DPR-RI', 'DPD-RI', 'DPRD-PROV', 'DPRD-KAB', 'PILGUB', 'PILBUP'];

    // 2. Baca Log Dokumen untuk pemetaan upload per TPS
    // Map key: "KECAMATAN|DESA|TPS" => Set of uploaded KODE_LEMBAGA
    const uploadMap = new Map();

    if (sheetLog && sheetLog.getLastRow() > 1) {
      const logData = sheetLog.getDataRange().getValues();
      for (let i = 1; i < logData.length; i++) {
        const row = logData[i];
        const kec = String(row[4] || '').trim().toUpperCase();
        const desa = String(row[5] || '').trim().toUpperCase();
        const tps = formatTPS(String(row[6] || '').trim());
        const kodeLembaga = normalizeKodeLembaga(String(row[3] || '').trim());

        const key = kec + '|' + desa + '|' + tps;
        if (!uploadMap.has(key)) {
          uploadMap.set(key, new Set());
        }
        if (kodeLembaga) {
          uploadMap.get(key).add(kodeLembaga);
        }
      }
    }

    // 3. Baca Master Wilayah dan hitung status per TPS
    const wilayahData = sheetWilayah.getDataRange().getValues();
    const records = [];
    let countLengkap = 0;
    let countBelumLengkap = 0;
    let countKosong = 0;

    const normFilterKec = filterKecamatan ? filterKecamatan.trim().toUpperCase() : '';
    const normFilterDesa = filterDesa ? filterDesa.trim().toUpperCase() : '';

    for (let i = 1; i < wilayahData.length; i++) {
      const kec = String(wilayahData[i][1] || '').trim().toUpperCase();
      const desa = String(wilayahData[i][2] || '').trim().toUpperCase();
      const tps = formatTPS(String(wilayahData[i][3] || '').trim());

      if (!kec || !desa || !tps) continue;

      // Filter wilayah jika parameter diberikan
      if (normFilterKec && kec !== normFilterKec) continue;
      if (normFilterDesa && desa !== normFilterDesa) continue;

      const key = kec + '|' + desa + '|' + tps;
      const uploadedSet = uploadMap.get(key) || new Set();

      const rincian = {};
      let totalUpload = 0;
      targetLembaga.forEach(kode => {
        const isUploaded = uploadedSet.has(kode);
        rincian[kode] = isUploaded;
        if (isUploaded) totalUpload++;
      });

      // Aturan SOT 06-BUSINESS-RULES.md:
      // LENGKAP (7/7) | BELUM LENGKAP (>0) | KOSONG (0)
      let status = 'KOSONG';
      if (totalUpload === targetLembaga.length) {
        status = 'LENGKAP';
        countLengkap++;
      } else if (totalUpload > 0) {
        status = 'BELUM LENGKAP';
        countBelumLengkap++;
      } else {
        status = 'KOSONG';
        countKosong++;
      }

      records.push({
        kecamatan: kec,
        desa: desa,
        tps: tps,
        status: status,
        totalUpload: totalUpload,
        targetTotal: targetLembaga.length,
        rincian: rincian
      });
    }

    return {
      status: 'success',
      summary: {
        totalTPS: records.length,
        lengkap: countLengkap,
        belumLengkap: countBelum,
        kosong: countKosong
      },
      records: records
    };

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
        'DRIVE_FILE_ID', 'DRIVE_URL'
      ]);
    }

    sheet.appendRow([
      item.timestamp,
      item.fileName,
      item.jenisFile,
      item.lembaga,
      item.kecamatan,
      item.desa,
      item.tps,
      item.totalHalaman,
      item.fileId,
      item.fileUrl
    ]);
  } catch (err) {
    Logger.log('Error logUploadedDocument: ' + err.message);
  }
}

function getOrCreateRootFolder() {
  const rootId = PropertiesService.getScriptProperties().getProperty('APP_ROOT_FOLDER_ID');
  if (rootId) {
    try {
      return DriveApp.getFolderById(rootId);
    } catch (e) {
      Logger.log('Root folder ID invalid, making fallback search.');
    }
  }

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

  // 1. Setup Master_Kategori
  let sheetKategori = ss.getSheetByName(SHEETS.KATEGORI);
  if (!sheetKategori) {
    sheetKategori = ss.insertSheet(SHEETS.KATEGORI);
  }
  sheetKategori.clear();
  initSheetHeader(sheetKategori, ['JENIS_FILE', 'NAMA_LEMBAGA', 'KODE_LEMBAGA']);
  
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

  // 2. Setup Master_Wilayah (19 Kecamatan Kabupaten Gorontalo)
  let sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);
  if (!sheetWilayah) {
    sheetWilayah = ss.insertSheet(SHEETS.WILAYAH);
  }
  sheetWilayah.clear();
  initSheetHeader(sheetWilayah, ['ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS']);

  const wilayahRows = generateMasterWilayahRows();
  if (wilayahRows.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < wilayahRows.length; i += batchSize) {
      const slice = wilayahRows.slice(i, i + batchSize);
      sheetWilayah.getRange(i + 2, 1, slice.length, 4).setValues(slice);
    }
  }

  // 3. Setup Log_Dokumen
  let sheetLog = ss.getSheetByName(SHEETS.LOG);
  if (!sheetLog) {
    sheetLog = ss.insertSheet(SHEETS.LOG);
  }
  if (sheetLog.getLastRow() === 0) {
    initSheetHeader(sheetLog, [
      'TIMESTAMP', 'FILE_NAME', 'JENIS_FILE', 'NAMA_LEMBAGA',
      'KECAMATAN', 'DESA', 'TPS', 'JUMLAH_HALAMAN',
      'DRIVE_FILE_ID', 'DRIVE_URL'
    ]);
  }

  // 4. Setup Rekap_Progres
  let sheetRekap = ss.getSheetByName(SHEETS.REKAP);
  if (!sheetRekap) {
    sheetRekap = ss.insertSheet(SHEETS.REKAP);
  }
  sheetRekap.clear();
  initSheetHeader(sheetRekap, [
    'ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS',
    'PPWP', 'DPR_RI', 'DPD_RI', 'DPRD_PROV', 'DPRD_KAB', 'PILGUB', 'PILBUP',
    'TOTAL_UPLOAD', 'STATUS_AKHIR'
  ]);

  SpreadsheetApp.flush();
  Logger.log('Inisialisasi Database SIMAMBIL Berhasil! Total Wilayah: ' + wilayahRows.length);
  return 'Setup Database Selesai. Total TPS terdaftar: ' + wilayahRows.length;
}

function initSheetHeader(sheet, headers) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#800000');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

function generateMasterWilayahRows() {
  const masterKecDesa = [
    { kec: 'ASPARAGA', desa: ['BULULI', 'KARYA BARU', 'KARYA INDAH', 'MOHIYOLO', 'OLIMOHULO', 'PANGAHU', 'PRIMA', 'TIOHU'] },
    { kec: 'BATUDAA', desa: ['BUNTULIA', 'DUNGGALA', 'HULAAWA', 'ILOHUNGAYO', 'ILUTA', 'PAYUNGA', 'PILOBUHUTA', 'YOSONEGORO'] },
    { kec: 'BATUDAA PANTAI', desa: ['BILUHU TIMUR', 'BONGO', 'BUNGI', 'KAYUBULAN', 'LAMU', 'OLIMOO', 'TONTAYUO'] },
    { kec: 'BILATO', desa: ['BILATO', 'BUMELA', 'ILOMATA', 'JURIKO', 'LAMAHU', 'PELEHU', 'TAULA A', 'TOTOPO'] },
    { kec: 'BILUHU', desa: ['BILUHU BARAT', 'HUWONGO', 'LOBUTO', 'LULUO', 'MEMISO'] },
    { kec: 'BOLIYOHUTO', desa: ['BANDUNGAN', 'BONGONGOAYU', 'DILONIYOHU', 'DULOHUPA', 'MOTILANGO', 'PARUNGI', 'POTANGA', 'SIDOMULYO'] },
    { kec: 'BONGOMEME', desa: ['BATU LORENG', 'BATULAYAR', 'BONGOHULAWA', 'DULAMAYO', 'HUNTULOHULAWA', 'KAYUMERE', 'MOLAS', 'MOLOPATODU', 'OTOPADE', 'TOHUPO'] },
    { kec: 'DUNGALIYO', desa: ['AMBARA', 'AYUHULA', 'BONGOMEME', 'BOTUBULOWE', 'DUNGALIYO', 'KALIYOSO', 'MOMUNU', 'PANGADAA', 'PILOLALENGA', 'SUKMA'] },
    { kec: 'LIMBOTO', desa: ['BIYONGA', 'BOLIHUANGGA', 'BONGOHULAWA', 'DUTULANAA', 'HEPUHULAWA', 'HUIDUTUA', 'HUNGGALUWA', 'HUTUO', 'KAYUBULAN', 'MALAHU', 'POLOHUNGO', 'TENILO', 'TILIHUWA'] },
    { kec: 'LIMBOTO BARAT', desa: ['DAENAA', 'HAYA HAYA', 'HUIDU', 'HUTABOHU', 'OMBULO', 'PADENGO', 'PONE', 'RATA', 'TUNGGULO', 'YOSONEGORO'] },
    { kec: 'MOOTILANGO', desa: ['HELUMO', 'HUYULA', 'KARYAMUKTI', 'PARIS', 'PAYU', 'PILOMONU', 'SATRIA', 'SUKAMAJU', 'TALUMOPATU'] },
    { kec: 'PULUBALA', desa: ['BAKTI', 'MULYONEGORO', 'PONGONGAILA', 'PULUBALA', 'PUNCAK', 'TOYIDITO', 'TRIDHARMA'] },
    { kec: 'TABONGO', desa: ['ILOMANGGA', 'LIMEHE BARAT', 'LIMEHE TIMUR', 'MOAHUDU', 'MOTINELO', 'TABONGO BARAT', 'TABONGO TIMUR', 'TERATAI'] },
    { kec: 'TELAGA', desa: ['DULAMAYO BARAT', 'DULAMAYO SELATAN', 'HULAWA', 'LUHU', 'MONGOLATO', 'PILOHAYANGA', 'PILOHAYANGA BARAT', 'TINELO'] },
    { kec: 'TELAGA BIRU', desa: ['DULAMAYO BARAT', 'DULAMAYO UTARA', 'DUMATI', 'LUPOYO', 'MODELIDU', 'PANTUNGO', 'PENTADIO BARAT', 'PENTADIO TIMUR', 'TALUMELITO', 'TAPALULUO', 'TULADENGGI', 'ULAPATO A', 'ULAPATO B'] },
    { kec: 'TELAGA JAYA', desa: ['BUHUDAA', 'BULOTA', 'BUNGGALO', 'LUWOO'] },
    { kec: 'TIBAWA', desa: ['BALAHU', 'BOTUMOPUTI', 'BUHU', 'DATAHU', 'ISIMU BARAT', 'ISIMU SELATAN', 'ISIMU UTARA', 'LABANU', 'MOLOWAHU', 'MOTILANGO', 'REKSONEGORO', 'TOLOTIO', 'ULOBUA'] },
    { kec: 'TILANGO', desa: ['DULOMO', 'ILOTIDEA', 'LAUWONU', 'TABUMELA', 'TENGGELA', 'TUALANGO'] },
    { kec: 'TOLANGOHULA', desa: ['BINA JAYA', 'GANDARIA', 'LAKEYA', 'MAKMUR ABADI', 'MARGOMULYO', 'MOLOHU', 'OMBULO HIJAU', 'SUKAMAKMUR', 'TAMALIA', 'TAMAILA UTARA'] }
  ];

  const rows = [];
  masterKecDesa.forEach(item => {
    item.desa.forEach(d => {
      const tpsCount = 4;
      for (let t = 1; t <= tpsCount; t++) {
        const noTps = ('000' + t).slice(-3);
        const idTps = 'TPS_' + item.kec + '_' + d.replace(/\s+/g, '-') + '_' + noTps;
        rows.push([idTps, item.kec, d, noTps]);
      }
    });
  });

  return rows;
}

function getFallbackMasterData() {
  const masterKecDesa = [
    { kec: 'ASPARAGA', desa: ['BULULI', 'KARYA BARU', 'KARYA INDAH', 'MOHIYOLO', 'OLIMOHULO', 'PANGAHU', 'PRIMA', 'TIOHU'] },
    { kec: 'BATUDAA', desa: ['BUNTULIA', 'DUNGGALA', 'HULAAWA', 'ILOHUNGAYO', 'ILUTA', 'PAYUNGA', 'PILOBUHUTA', 'YOSONEGORO'] },
    { kec: 'BATUDAA PANTAI', desa: ['BILUHU TIMUR', 'BONGO', 'BUNGI', 'KAYUBULAN', 'LAMU', 'OLIMOO', 'TONTAYUO'] },
    { kec: 'BILATO', desa: ['BILATO', 'BUMELA', 'ILOMATA', 'JURIKO', 'LAMAHU', 'PELEHU', 'TAULA A', 'TOTOPO'] },
    { kec: 'BILUHU', desa: ['BILUHU BARAT', 'HUWONGO', 'LOBUTO', 'LULUO', 'MEMISO'] },
    { kec: 'BOLIYOHUTO', desa: ['BANDUNGAN', 'BONGONGOAYU', 'DILONIYOHU', 'DULOHUPA', 'MOTILANGO', 'PARUNGI', 'POTANGA', 'SIDOMULYO'] },
    { kec: 'BONGOMEME', desa: ['BATU LORENG', 'BATULAYAR', 'BONGOHULAWA', 'DULAMAYO', 'HUNTULOHULAWA', 'KAYUMERE', 'MOLAS', 'MOLOPATODU', 'OTOPADE', 'TOHUPO'] },
    { kec: 'DUNGALIYO', desa: ['AMBARA', 'AYUHULA', 'BONGOMEME', 'BOTUBULOWE', 'DUNGALIYO', 'KALIYOSO', 'MOMUNU', 'PANGADAA', 'PILOLALENGA', 'SUKMA'] },
    { kec: 'LIMBOTO', desa: ['BIYONGA', 'BOLIHUANGGA', 'BONGOHULAWA', 'DUTULANAA', 'HEPUHULAWA', 'HUIDUTUA', 'HUNGGALUWA', 'HUTUO', 'KAYUBULAN', 'MALAHU', 'POLOHUNGO', 'TENILO', 'TILIHUWA'] },
    { kec: 'LIMBOTO BARAT', desa: ['DAENAA', 'HAYA HAYA', 'HUIDU', 'HUTABOHU', 'OMBULO', 'PADENGO', 'PONE', 'RATA', 'TUNGGULO', 'YOSONEGORO'] },
    { kec: 'MOOTILANGO', desa: ['HELUMO', 'HUYULA', 'KARYAMUKTI', 'PARIS', 'PAYU', 'PILOMONU', 'SATRIA', 'SUKAMAJU', 'TALUMOPATU'] },
    { kec: 'PULUBALA', desa: ['BAKTI', 'MULYONEGORO', 'PONGONGAILA', 'PULUBALA', 'PUNCAK', 'TOYIDITO', 'TRIDHARMA'] },
    { kec: 'TABONGO', desa: ['ILOMANGGA', 'LIMEHE BARAT', 'LIMEHE TIMUR', 'MOAHUDU', 'MOTINELO', 'TABONGO BARAT', 'TABONGO TIMUR', 'TERATAI'] },
    { kec: 'TELAGA', desa: ['DULAMAYO BARAT', 'DULAMAYO SELATAN', 'HULAWA', 'LUHU', 'MONGOLATO', 'PILOHAYANGA', 'PILOHAYANGA BARAT', 'TINELO'] },
    { kec: 'TELAGA BIRU', desa: ['DULAMAYO BARAT', 'DULAMAYO UTARA', 'DUMATI', 'LUPOYO', 'MODELIDU', 'PANTUNGO', 'PENTADIO BARAT', 'PENTADIO TIMUR', 'TALUMELITO', 'TAPALULUO', 'TULADENGGI', 'ULAPATO A', 'ULAPATO B'] },
    { kec: 'TELAGA JAYA', desa: ['BUHUDAA', 'BULOTA', 'BUNGGALO', 'LUWOO'] },
    { kec: 'TIBAWA', desa: ['BALAHU', 'BOTUMOPUTI', 'BUHU', 'DATAHU', 'ISIMU BARAT', 'ISIMU SELATAN', 'ISIMU UTARA', 'LABANU', 'MOLOWAHU', 'MOTILANGO', 'REKSONEGORO', 'TOLOTIO', 'ULOBUA'] },
    { kec: 'TILANGO', desa: ['DULOMO', 'ILOTIDEA', 'LAUWONU', 'TABUMELA', 'TENGGELA', 'TUALANGO'] },
    { kec: 'TOLANGOHULA', desa: ['BINA JAYA', 'GANDARIA', 'LAKEYA', 'MAKMUR ABADI', 'MARGOMULYO', 'MOLOHU', 'OMBULO HIJAU', 'SUKAMAKMUR', 'TAMALIA', 'TAMAILA UTARA'] }
  ];

  return {
    status: 'success',
    jenisDokumen: ['Model C-Plano', 'Model D-Plano'],
    lembaga: [
      { nama: 'Presiden dan Wakil Presiden', kode: 'PPWP' },
      { nama: 'DPR RI', kode: 'DPR-RI' },
      { nama: 'DPD RI', kode: 'DPD-RI' },
      { nama: 'DPRD Provinsi', kode: 'DPRD-PROV' },
      { nama: 'DPRD Kabupaten / Kota', kode: 'DPRD-KAB' },
      { nama: 'Gubernur dan Wakil Gubernur', kode: 'PILGUB' },
      { nama: 'Bupati dan Wakil Bupati', kode: 'PILBUP' }
    ],
    wilayah: masterKecDesa.map(item => ({
      kecamatan: item.kec,
      desaList: item.desa.map(d => ({
        desa: d,
        tpsList: ['001', '002', '003', '004']
      }))
    }))
  };
}

function getFallbackMonitoringSummary(filterKec, filterDesa) {
  const master = getFallbackMasterData();
  const records = [];
  let countLengkap = 0;
  let countBelum = 0;
  let countKosong = 0;

  const targetKec = filterKec ? filterKec.toUpperCase() : '';
  const targetDesa = filterDesa ? filterDesa.toUpperCase() : '';

  master.wilayah.forEach(itemKec => {
    if (targetKec && itemKec.kecamatan !== targetKec) return;
    itemKec.desaList.forEach(itemDesa => {
      if (targetDesa && itemDesa.desa !== targetDesa) return;
      itemDesa.tpsList.forEach(tps => {
        records.push({
          kecamatan: itemKec.kecamatan,
          desa: itemDesa.desa,
          tps: tps,
          status: 'KOSONG',
          totalUpload: 0,
          targetTotal: 7,
          rincian: {
            'PPWP': false,
            'DPR-RI': false,
            'DPD-RI': false,
            'DPRD-PROV': false,
            'DPRD-KAB': false,
            'PILGUB': false,
            'PILBUP': false
          }
        });
        countKosong++;
      });
    });
  });

  return {
    status: 'success',
    summary: {
      totalTPS: records.length,
      lengkap: countLengkap,
      belumLengkap: countBelum,
      kosong: countKosong
    },
    records: records
  };
}
