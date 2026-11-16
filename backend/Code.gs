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

// Target Root Folder ID di Google Drive
const TARGET_DRIVE_FOLDER_ID = '1qNJXHcGDAyxZkHwm63tptp85iaNRpdSI';
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

    const op = meta.operator || {};
    const opNama = String(op.nama || '').trim();
    const opNip = String(op.nip || '').trim();
    const opJabatan = String(op.jabatan || '').trim();

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
      fileUrl: fileUrl,
      operatorNama: opNama,
      operatorNip: opNip,
      operatorJabatan: opJabatan
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
    const processedKeys = new Set();
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

      const key = kec + '|' + desa + '|' + tps;
      processedKeys.add(key);

      // Filter wilayah jika parameter diberikan
      if (normFilterKec && kec !== normFilterKec) continue;
      if (normFilterDesa && desa !== normFilterDesa) continue;

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

    // 4. Tambahkan juga TPS dari Log jika ada berkas yang diunggah tetapi belum terdata di Master_Wilayah
    uploadMap.forEach((uploadedSet, key) => {
      if (processedKeys.has(key)) return;
      const parts = key.split('|');
      if (parts.length < 3) return;
      const kec = parts[0];
      const desa = parts[1];
      const tps = parts[2];

      if (normFilterKec && kec !== normFilterKec) return;
      if (normFilterDesa && desa !== normFilterDesa) return;

      const rincian = {};
      let totalUpload = 0;
      targetLembaga.forEach(kode => {
        const isUploaded = uploadedSet.has(kode);
        rincian[kode] = isUploaded;
        if (isUploaded) totalUpload++;
      });

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
    });

    // Urutkan records berdasarkan Kecamatan, Desa, dan Nomor TPS
    records.sort((a, b) => {
      if (a.kecamatan !== b.kecamatan) return a.kecamatan.localeCompare(b.kecamatan);
      if (a.desa !== b.desa) return a.desa.localeCompare(b.desa);
      return a.tps.localeCompare(b.tps);
    });

    return {
      status: 'success',
      summary: {
        totalTPS: records.length,
        lengkap: countLengkap,
        belumLengkap: countBelumLengkap,
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
      item.timestamp,
      item.fileName,
      item.jenisFile,
      item.lembaga,
      item.kecamatan,
      item.desa,
      item.tps,
      item.totalHalaman,
      item.fileId,
      item.fileUrl,
      item.operatorNama || '-',
      item.operatorNip || '-',
      item.operatorJabatan || '-'
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

  // 2. Setup Master_Wilayah (Non-destructive: tidak ada data dummy, dikelola mandiri oleh admin KPU)
  let sheetWilayah = ss.getSheetByName(SHEETS.WILAYAH);
  if (!sheetWilayah) {
    sheetWilayah = ss.insertSheet(SHEETS.WILAYAH);
  }
  ensureSheetHeaders(sheetWilayah, ['ID_TPS', 'NAMA_KEC', 'NAMA_DESA', 'NO_TPS']);

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
    lembaga: [
      { nama: 'Presiden dan Wakil Presiden', kode: 'PPWP' },
      { nama: 'DPR RI', kode: 'DPR-RI' },
      { nama: 'DPD RI', kode: 'DPD-RI' },
      { nama: 'DPRD Provinsi', kode: 'DPRD-PROV' },
      { nama: 'DPRD Kabupaten / Kota', kode: 'DPRD-KAB' },
      { nama: 'Gubernur dan Wakil Gubernur', kode: 'PILGUB' },
      { nama: 'Bupati dan Wakil Bupati', kode: 'PILBUP' }
    ],
    wilayah: []
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
