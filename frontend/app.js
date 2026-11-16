/**
 * ==============================================================================
 * SIMAMBIL - Frontend Logic (Decoupled Vercel Edition)
 * SOT Reference: 02-USER-FLOW.md, 03-UI-GUIDELINE.md, 05-API-SPEC.md, 06-BUSINESS-RULES.md
 * ==============================================================================
 */

// Global State & Aturan Halaman Lengkap SOT 06-BUSINESS-RULES.md
const MAX_PAGES = 20;

const TARGET_HALAMAN = {
  'PPWP': 3,
  'DPD-RI': 3,
  'DPR-RI': 20,
  'DPRD-PROV': 20,
  'DPRD-KAB': 20,
  'PILGUB': 3,
  'PILBUP': 3
};

const SHORT_LEMBAGA_NAMES = {
  'PPWP': 'PPWP',
  'DPD-RI': 'DPD',
  'DPR-RI': 'DPR',
  'DPRD-PROV': 'DPRD-P',
  'DPRD-KAB': 'DPRD-K',
  'PILGUB': 'GUB',
  'PILBUP': 'BUP'
};

const NAMA_LEMBAGA_FULL = {
  'PPWP': '1. PPWP (Presiden & Wapres)',
  'DPD-RI': '2. DPD RI',
  'DPR-RI': '3. DPR RI',
  'DPRD-PROV': '4. DPRD Provinsi',
  'DPRD-KAB': '5. DPRD Kabupaten/Kota',
  'PILGUB': '6. Gubernur & Wagub (PILGUB)',
  'PILBUP': '7. Bupati & Wabup (PILBUP)'
};

let pagesState = []; // [{ page: 1, dataUrl: null, rotation: 0 }, ...]
let activeSlotIndex = null;
let currentFacingMode = 'environment';
let cameraStream = null;
let masterDataCache = null;
let allRekapRecords = [];
let rekapKecamatanList = [];
let currentRekapFilterStatus = 'ALL';
let currentRekapViewMode = 'wilayah'; // 'wilayah' atau 'tps'
let currentWilayahFilter = 'PENDING'; // 'PENDING', 'ALL', 'KOSONG', 'LENGKAP'

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  initPagesState();
  renderPageSlots();
  loadMasterData();
  setupNetworkListeners();
  registerPWA();
  checkOperatorGate();
  syncAllPickers();
  updateTargetPageUI();
});

/**
 * ==============================================================================
 * 1. IDENTITAS & PROFIL OPERATOR (SOT: 06-BUSINESS-RULES.md)
 * ==============================================================================
 */
function getOperatorProfile() {
  try {
    const raw = localStorage.getItem('SIMAMBIL_OPERATOR');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveOperatorProfile(data) {
  localStorage.setItem('SIMAMBIL_OPERATOR', JSON.stringify(data));
  updateOperatorHeaderUI();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * In-App Dialog & Toast Notification System
 * Replaces ugly browser native alert() with sleek KPU-styled mobile dialogs
 */
let appToastTimer = null;

function showAppToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('appToast');
  const icon = document.getElementById('appToastIcon');
  const text = document.getElementById('appToastText');
  if (!toast || !text) return;

  if (appToastTimer) clearTimeout(appToastTimer);

  text.textContent = message;
  toast.className = 'app-toast active ' + type;

  if (type === 'success') {
    if (icon) icon.textContent = '✓';
  } else if (type === 'error') {
    if (icon) icon.textContent = '✕';
  } else {
    if (icon) icon.textContent = 'ℹ️';
  }

  appToastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, duration);
}

function showAppDialog({ title, message, type = 'info', confirmText = 'Mengerti', cancelText = null, onConfirm = null, onCancel = null }) {
  const modal = document.getElementById('appDialogModal');
  const titleEl = document.getElementById('appDialogTitle');
  const msgEl = document.getElementById('appDialogMessage');
  const iconWrapper = document.getElementById('appDialogIconWrapper');
  const iconEl = document.getElementById('appDialogIcon');
  const actionsEl = document.getElementById('appDialogActions');

  if (!modal) {
    if (onConfirm) onConfirm();
    return;
  }

  if (titleEl) titleEl.textContent = title || 'Informasi';
  if (msgEl) msgEl.innerHTML = message || '';

  if (iconWrapper && iconEl) {
    iconWrapper.className = 'app-dialog-icon-wrapper ' + type;
    if (type === 'success') {
      iconEl.textContent = '✓';
    } else if (type === 'error') {
      iconEl.textContent = '✕';
    } else {
      iconEl.textContent = '!';
    }
  }

  if (actionsEl) {
    actionsEl.innerHTML = '';
    if (cancelText) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.style.flex = '1';
      cancelBtn.textContent = cancelText;
      cancelBtn.onclick = () => {
        modal.classList.remove('active');
        if (onCancel) onCancel();
      };
      actionsEl.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.style.flex = '1';
    confirmBtn.textContent = confirmText;
    confirmBtn.onclick = () => {
      modal.classList.remove('active');
      if (onConfirm) onConfirm();
    };
    actionsEl.appendChild(confirmBtn);
  }

  modal.classList.add('active');
}

function updateOperatorHeaderUI() {
  const op = getOperatorProfile();
  const elName = document.getElementById('headerOpName');
  const elRole = document.getElementById('headerOpRole');
  const elNip = document.getElementById('headerOpNip');

  if (op && op.nama) {
    if (elName) elName.textContent = op.nama;
    if (elRole) {
      elRole.textContent = op.jabatan || 'Operator';
      elRole.style.display = 'inline-block';
    }
    if (elNip) {
      elNip.textContent = op.nip && op.nip !== '-' ? `NIP: ${op.nip}` : 'Non-NIP';
    }
  } else {
    if (elName) elName.textContent = 'Klik untuk Mengisi Identitas';
    if (elRole) elRole.style.display = 'none';
    if (elNip) elNip.textContent = 'Operator Belum Terdaftar';
  }
}

function checkOperatorGate() {
  const op = getOperatorProfile();
  updateOperatorHeaderUI();
  const validJabatan = op && (op.jabatan === 'Sekretariat' || op.jabatan === 'Komisioner');
  if (!op || !op.nama || !op.nip || !validJabatan) {
    openOperatorModal(false);
  }
}

function openOperatorModal(canClose = true) {
  const modal = document.getElementById('operatorModal');
  const closeBtn = document.getElementById('closeOpModalBtn');
  const inputNama = document.getElementById('inputOpNama');
  const inputNip = document.getElementById('inputOpNip');
  const selectJabatan = document.getElementById('selectOpJabatan');

  const current = getOperatorProfile();
  if (current) {
    if (inputNama) inputNama.value = current.nama || '';
    if (inputNip) inputNip.value = current.nip || '';
    if (selectJabatan) {
      if (current.jabatan === 'Sekretariat' || current.jabatan === 'Komisioner') {
        selectJabatan.value = current.jabatan;
      } else {
        selectJabatan.value = '';
      }
    }
  }

  const validJabatan = current && (current.jabatan === 'Sekretariat' || current.jabatan === 'Komisioner');
  if (closeBtn) {
    closeBtn.style.display = (canClose && current && current.nama && validJabatan) ? 'flex' : 'none';
  }

  syncAllPickers();
  if (modal) modal.classList.add('active');
}

function closeOperatorModal() {
  const op = getOperatorProfile();
  const validJabatan = op && (op.jabatan === 'Sekretariat' || op.jabatan === 'Komisioner');
  if (!op || !op.nama || !op.nip || !validJabatan) {
    showAppToast('Harap lengkapi identitas dan pilih Jabatan terlebih dahulu.', 'warning');
    return;
  }
  const modal = document.getElementById('operatorModal');
  if (modal) modal.classList.remove('active');
}

function handleOperatorFormSubmit(event) {
  event.preventDefault();
  const nama = (document.getElementById('inputOpNama')?.value || '').trim();
  const nip = (document.getElementById('inputOpNip')?.value || '').trim();
  const jabatan = (document.getElementById('selectOpJabatan')?.value || '').trim();

  if (!nama || !nip || (jabatan !== 'Sekretariat' && jabatan !== 'Komisioner')) {
    showAppToast('Harap lengkapi semua kolom dan pilih Jabatan!', 'warning');
    return;
  }

  saveOperatorProfile({ nama, nip, jabatan });
  
  const modal = document.getElementById('operatorModal');
  if (modal) modal.classList.remove('active');

  showAppDialog({
    title: 'Identitas Berhasil Disimpan',
    type: 'success',
    message: `Selamat bertugas di SIMAMBIL!<br><br><strong style="font-size:15px; color:#1E293B;">${escapeHtml(nama)}</strong><br><span style="color:#64748B; font-size:12px;">NIP: ${escapeHtml(nip)} • Jabatan: ${escapeHtml(jabatan)}</span>`,
    confirmText: 'Mulai Bekerja'
  });
}

/**
 * ==============================================================================
 * 2. CONFIGURATION & SETTINGS
 * ==============================================================================
 */
function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const input = document.getElementById('inputGasUrl');
  const statusEl = document.getElementById('settingsTestStatus');

  if (input) input.value = AppConfig.getApiUrl() || '';
  if (statusEl) statusEl.textContent = '';
  if (modal) modal.classList.add('active');
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('active');
}

function saveGasUrl() {
  const input = document.getElementById('inputGasUrl');
  const val = (input?.value || '').trim();

  if (val && !val.startsWith('https://script.google.com')) {
    showAppToast('URL Apps Script harus diawali dengan https://script.google.com', 'error');
    return;
  }

  AppConfig.setApiUrl(val);
  showAppToast('URL Google Apps Script berhasil disimpan!', 'success');
  closeSettingsModal();

  // Muat ulang master data dan monitoring
  loadMasterData();
}

async function testGasConnection() {
  const input = document.getElementById('inputGasUrl');
  const statusEl = document.getElementById('settingsTestStatus');
  const val = (input?.value || '').trim();

  if (!val || !val.startsWith('https://script.google.com')) {
    if (statusEl) {
      statusEl.style.color = 'var(--status-red)';
      statusEl.textContent = 'Masukkan URL Apps Script yang valid terlebih dahulu.';
    }
    return;
  }

  if (statusEl) {
    statusEl.style.color = 'var(--kpu-gold-dark)';
    statusEl.textContent = 'Menguji koneksi ke Google Apps Script...';
  }

  try {
    const testUrl = `${val}${val.includes('?') ? '&' : '?'}action=getMasterData`;
    const res = await fetch(testUrl, { redirect: 'follow' });
    const json = await res.json();

    if (json && json.status === 'success') {
      if (statusEl) {
        statusEl.style.color = 'var(--status-green)';
        statusEl.textContent = 'Koneksi Berhasil! Terhubung ke Google Apps Script.';
      }
    } else {
      throw new Error(json.message || 'Respon tidak sesuai format.');
    }
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = 'var(--status-red)';
      statusEl.textContent = 'Gagal terhubung: ' + err.message;
    }
  }
}

/**
 * ==============================================================================
 * 2. INISIALISASI & MASTER DATA WILAYAH (REST API)
 * SOT: 05-API-SPEC.md (GET ?action=getMasterData)
 * ==============================================================================
 */
function getTargetPagesForCurrentLembaga() {
  const selectedLembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  return TARGET_HALAMAN[selectedLembaga] || 3;
}

function initPagesState(numPages) {
  const targetPages = numPages || getTargetPagesForCurrentLembaga();
  pagesState = [];
  for (let i = 0; i < targetPages; i++) {
    pagesState.push({
      page: i + 1,
      dataUrl: null,
      rotation: 0
    });
  }
}

function syncPagesStateWithLembaga() {
  const targetPages = getTargetPagesForCurrentLembaga();
  while (pagesState.length < targetPages) {
    pagesState.push({
      page: pagesState.length + 1,
      dataUrl: null,
      rotation: 0
    });
  }
  if (pagesState.length > targetPages) {
    pagesState = pagesState.slice(0, targetPages);
  }
}

async function loadMasterData() {
  const apiUrl = AppConfig.getApiUrl();
  const authToken = AppConfig.getAuthToken ? AppConfig.getAuthToken() : '';
  const tokenQuery = authToken ? `&token=${encodeURIComponent(authToken)}` : '';

  // 1. Coba endpoint utama (Proxy /api/gas jika di Vercel atau Direct URL)
  if (apiUrl) {
    try {
      const endpoint = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}action=getMasterData${tokenQuery}`;
      const res = await fetch(endpoint, { redirect: 'follow' });
      const json = await res.json();
      if (json && json.status === 'success') {
        handleMasterDataSuccess(json);
        return;
      }
    } catch (e) {
      console.warn('Gagal memuat master data dari endpoint utama:', e);
    }
  }

  // 2. Fallback ke Direct URL jika endpoint utama adalah proxy
  if (apiUrl !== DIRECT_GAS_URL && typeof DIRECT_GAS_URL !== 'undefined') {
    try {
      const directEndpoint = `${DIRECT_GAS_URL}?action=getMasterData${tokenQuery}`;
      const res = await fetch(directEndpoint, { redirect: 'follow' });
      const json = await res.json();
      if (json && json.status === 'success') {
        handleMasterDataSuccess(json);
        return;
      }
    } catch (e2) {
      console.warn('Fallback direct GAS URL juga gagal:', e2);
    }
  }

  // 3. Fallback lokal jika offline total
  const fallback = getLocalFallbackMasterData();
  handleMasterDataSuccess(fallback);
}

function handleMasterDataSuccess(res) {
  if (!res || res.status !== 'success') return;
  masterDataCache = res;

  // 1. Populasi Dropdown Kecamatan
  const selectKec = document.getElementById('selectKecamatan');
  const selectFilterKec = document.getElementById('filterRekapKecamatan');
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');
  
  if (selectKec) {
    selectKec.innerHTML = '<option value="">-- Pilih Kecamatan --</option>';
  }
  if (selectFilterKec) {
    selectFilterKec.innerHTML = '<option value="">-- Semua Kecamatan --</option>';
  }

  const wilayah = res.wilayah || [];

  if (wilayah.length === 0) {
    if (selectKec) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- Belum ada data wilayah di Spreadsheet --';
      selectKec.appendChild(opt);
    }
    if (selectDesa) {
      selectDesa.innerHTML = '<option value="">-- Belum ada data desa --</option>';
      selectDesa.disabled = true;
    }
    if (selectTPS) {
      selectTPS.innerHTML = '<option value="">-- Belum ada data TPS --</option>';
      selectTPS.disabled = true;
    }
    updateGeneratedFilename();
  } else {
    wilayah.forEach(item => {
      if (selectKec) {
        const opt = document.createElement('option');
        opt.value = item.kecamatan;
        opt.textContent = item.kecamatan;
        selectKec.appendChild(opt);
      }

      if (selectFilterKec) {
        const optFilter = document.createElement('option');
        optFilter.value = item.kecamatan;
        optFilter.textContent = item.kecamatan;
        selectFilterKec.appendChild(optFilter);
      }
    });

    // Set default pilihan pertama jika ada
    if (selectKec && wilayah.length > 0) {
      selectKec.value = wilayah[0].kecamatan;
      onKecamatanChanged();
    }
  }

  syncAllPickers();

  // Muat data awal monitoring
  loadRekapData();
  syncAllPickers();
}

/**
 * Cascading Dropdown: Kecamatan -> Desa -> TPS
 */
function onKecamatanChanged() {
  const selectedKec = document.getElementById('selectKecamatan')?.value || '';
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');

  if (!selectDesa || !selectTPS) return;

  selectDesa.innerHTML = '<option value="">-- Pilih Desa / Kelurahan --</option>';
  selectTPS.innerHTML = '<option value="">-- Pilih TPS --</option>';
  selectTPS.disabled = true;

  if (!selectedKec || !masterDataCache) {
    selectDesa.disabled = true;
    updateGeneratedFilename();
    syncAllPickers();
    return;
  }

  const kecObj = masterDataCache.wilayah.find(w => w.kecamatan === selectedKec);
  if (kecObj && kecObj.desaList) {
    kecObj.desaList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.desa;
      opt.textContent = d.desa;
      selectDesa.appendChild(opt);
    });
    selectDesa.disabled = false;
    
    // Pilih otomatis desa pertama
    if (kecObj.desaList.length > 0) {
      selectDesa.value = kecObj.desaList[0].desa;
      onDesaChanged();
    }
  } else {
    selectDesa.disabled = true;
  }

  updateGeneratedFilename();
  syncAllPickers();
}

function onDesaChanged() {
  const selectedKec = document.getElementById('selectKecamatan')?.value || '';
  const selectedDesa = document.getElementById('selectDesa')?.value || '';
  const selectTPS = document.getElementById('selectTPS');

  if (!selectTPS) return;
  selectTPS.innerHTML = '<option value="">-- Pilih TPS --</option>';

  if (!selectedKec || !selectedDesa || !masterDataCache) {
    selectTPS.disabled = true;
    updateGeneratedFilename();
    syncAllPickers();
    return;
  }

  const kecObj = masterDataCache.wilayah.find(w => w.kecamatan === selectedKec);
  if (kecObj) {
    const desaObj = kecObj.desaList.find(d => d.desa === selectedDesa);
    if (desaObj && desaObj.tpsList) {
      desaObj.tpsList.forEach(tps => {
        const opt = document.createElement('option');
        opt.value = tps;
        opt.textContent = 'TPS ' + tps;
        selectTPS.appendChild(opt);
      });
      selectTPS.disabled = false;

      // Pilih otomatis TPS pertama
      if (desaObj.tpsList.length > 0) {
        selectTPS.value = desaObj.tpsList[0];
      }
    } else {
      selectTPS.disabled = true;
    }
  }

  updateGeneratedFilename();
  syncAllPickers();
}

/**
 * Generator Nama Berkas Standar Baku Sesuai SOT 06-BUSINESS-RULES.md
 * Format: [JENIS_FILE]_[KODE_LEMBAGA]_[KECAMATAN]_[DESA]_[TPS].pdf
 */
function updateGeneratedFilename() {
  const jenis = document.getElementById('selectJenisFile')?.value || 'Model C-Plano';
  const lembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  const kec = document.getElementById('selectKecamatan')?.value || 'ASPARAGA';
  const desa = document.getElementById('selectDesa')?.value || 'DESA';
  const tps = document.getElementById('selectTPS')?.value || '001';

  const cleanJenis = sanitizeStr(jenis);
  const cleanLembaga = sanitizeStr(lembaga);
  const cleanKec = sanitizeStr(kec);
  const cleanDesa = sanitizeStr(desa);
  const cleanTps = formatTpsNum(tps);

  const filename = `${cleanJenis}_${cleanLembaga}_${cleanKec}_${cleanDesa}_${cleanTps}.pdf`;
  const previewEl = document.getElementById('previewFilename');
  if (previewEl) {
    previewEl.textContent = filename;
  }
  return filename;
}

function sanitizeStr(str) {
  return String(str || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9\-]/g, '');
}

function formatTpsNum(tps) {
  const n = parseInt(String(tps).replace(/\D/g, ''), 10);
  if (isNaN(n)) return '001';
  return ('000' + n).slice(-3);
}

/**
 * ==============================================================================
 * 3. MANAJEMEN SLOT HALAMAN & UI GRID (1 - 20)
 * SOT: 03-UI-GUIDELINE.md & 06-BUSINESS-RULES.md
 * ==============================================================================
 */

function onLembagaSelectionChanged() {
  updateGeneratedFilename();
  syncPagesStateWithLembaga();
  updateTargetPageUI();
  renderPageSlots();
  syncAllPickers();
}

function updateTargetPageUI() {
  const selectedLembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  const targetPages = TARGET_HALAMAN[selectedLembaga] || 3;
  const filledCount = pagesState.filter(p => p.dataUrl).length;

  const targetInfoText = document.getElementById('targetPageInfoText');
  const targetInfoStatus = document.getElementById('targetPageInfoStatus');
  const slotHint = document.getElementById('slotInstructionHint');

  if (targetInfoText) {
    targetInfoText.textContent = `${targetPages} Halaman`;
  }

  if (targetInfoStatus) {
    if (filledCount >= targetPages) {
      targetInfoStatus.textContent = `✓ ${filledCount}/${targetPages} Terpenuhi`;
      targetInfoStatus.style.color = '#15803d';
      targetInfoStatus.style.background = '#dcfce7';
    } else if (filledCount > 0) {
      targetInfoStatus.textContent = `Kurang ${targetPages - filledCount} Halaman`;
      targetInfoStatus.style.color = '#854d0e';
      targetInfoStatus.style.background = '#fef9c3';
    } else {
      targetInfoStatus.textContent = `0 / ${targetPages} Terisi`;
      targetInfoStatus.style.color = '#e11d48';
      targetInfoStatus.style.background = '#ffe4e6';
    }
  }

  if (slotHint) {
    slotHint.innerHTML = `Ketuk slot foto untuk memotret dokumen. Jumlah slot disesuaikan untuk <strong>${selectedLembaga}</strong>: <strong>${targetPages} Halaman</strong>.`;
  }
}

function renderPageSlots() {
  const container = document.getElementById('pageSlotsGrid');
  if (!container) return;
  container.innerHTML = '';

  const selectedLembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  const targetPages = TARGET_HALAMAN[selectedLembaga] || 3;

  syncPagesStateWithLembaga();

  // Terapkan layout 3 kolom untuk 3 halaman, atau 4 kolom untuk 20 halaman
  if (targetPages === 3) {
    container.classList.add('slots-3');
  } else {
    container.classList.remove('slots-3');
  }

  let filledCount = 0;

  pagesState.forEach((slot, index) => {
    const card = document.createElement('div');
    card.className = 'slot-card' + (slot.dataUrl ? ' filled' : '');
    card.onclick = () => onSlotClicked(index);

    if (slot.dataUrl) {
      filledCount++;
      card.innerHTML = `
        <img class="slot-thumb" src="${slot.dataUrl}" alt="Hal ${slot.page}">
        <div class="slot-overlay">
          <div class="slot-check-icon">✓</div>
          <span class="slot-filled-number">Hal ${slot.page}</span>
        </div>
      `;
    } else {
      const padNum = ('00' + slot.page).slice(-2);
      card.innerHTML = `
        <span class="slot-number">${padNum}</span>
        <span class="slot-label">Hal ${slot.page}</span>
        <span class="slot-tag-wajib">Wajib</span>
      `;
    }

    container.appendChild(card);
  });

  const badge = document.getElementById('pageCountBadge');
  if (badge) {
    if (filledCount >= targetPages) {
      badge.textContent = `✓ ${filledCount}/${targetPages} Terisi (Lengkap)`;
      badge.style.backgroundColor = 'var(--status-green)';
    } else if (filledCount > 0) {
      badge.textContent = `${filledCount}/${targetPages} Terisi (Kurang ${targetPages - filledCount} Hal)`;
      badge.style.backgroundColor = 'var(--status-yellow)';
    } else {
      badge.textContent = `0 / ${targetPages} Terisi`;
      badge.style.backgroundColor = 'var(--kpu-maroon)';
    }
  }

  const btnProcess = document.getElementById('btnProcessUpload');
  const btnProcessLabel = document.getElementById('btnProcessLabel');
  if (btnProcess) {
    btnProcess.disabled = filledCount === 0;
    if (btnProcessLabel) {
      btnProcessLabel.textContent = filledCount > 0 
        ? `Render & Simpan PDF (${filledCount} Hal)`
        : 'Render & Simpan PDF';
    }
  }

  updateTargetPageUI();
}

function onSlotClicked(index) {
  activeSlotIndex = index;
  const slot = pagesState[index];

  if (slot.dataUrl) {
    openPreviewModal(index);
  } else {
    openCameraModal(index);
  }
}

function confirmResetPages() {
  const filledCount = pagesState.filter(p => p.dataUrl).length;
  if (filledCount === 0) return;

  showAppDialog({
    title: 'Reset Seluruh Foto?',
    type: 'warning',
    message: `Apakah Anda yakin ingin menghapus seluruh <strong>${filledCount} foto halaman</strong> yang sudah diambil?`,
    confirmText: 'Ya, Reset Semua',
    cancelText: 'Batal',
    onConfirm: () => {
      initPagesState();
      renderPageSlots();
      showAppToast('Seluruh foto telah di-reset.', 'info');
    }
  });
}

/**
 * ==============================================================================
 * 4. KAMERA LANGSUNG & KOMPRESI CANVAS CLIENT-SIDE
 * SOT: 06-BUSINESS-RULES.md (Maks. 1600x1200, Kualitas JPEG 0.7 - 0.8)
 * ==============================================================================
 */
function openCameraModal(index) {
  activeSlotIndex = index;
  const modal = document.getElementById('cameraModal');
  const title = document.getElementById('cameraSlotTitle');
  if (title) title.textContent = `Halaman ${index + 1}`;
  modal.classList.add('active');

  startCameraStream();
}

function closeCameraModal() {
  stopCameraStream();
  const modal = document.getElementById('cameraModal');
  modal.classList.remove('active');
}

function startCameraStream() {
  stopCameraStream();
  const video = document.getElementById('cameraVideo');

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: currentFacingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  navigator.mediaDevices?.getUserMedia(constraints)
    .then(stream => {
      cameraStream = stream;
      video.srcObject = stream;
      video.play();
    })
    .catch(err => {
      console.warn('getUserMedia gagal atau tidak didukung:', err);
      triggerFallbackFile();
    });
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function toggleCameraFacing() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  startCameraStream();
}

function triggerFallbackFile() {
  const input = document.getElementById('fallbackFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function handleFallbackFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  showLoading('Mengompres Foto...', 'Mengoptimasi resolusi gambar...');
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const compressedDataUrl = compressImageCanvas(img);
      pagesState[activeSlotIndex].dataUrl = compressedDataUrl;
      pagesState[activeSlotIndex].rotation = 0;
      renderPageSlots();
      hideLoading();
      closeCameraModal();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function capturePhotoFromVideo() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth) {
    triggerFallbackFile();
    return;
  }

  showLoading('Mengambil Foto...', 'Mengompresi ke standar canvas...');
  
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = video.videoWidth;
  offscreenCanvas.height = video.videoHeight;
  const ctx = offscreenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const rawDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.95);
  const img = new Image();
  img.onload = () => {
    const compressedDataUrl = compressImageCanvas(img);
    pagesState[activeSlotIndex].dataUrl = compressedDataUrl;
    pagesState[activeSlotIndex].rotation = 0;
    renderPageSlots();
    hideLoading();
    closeCameraModal();
  };
  img.src = rawDataUrl;
}

/**
 * Kompresi Resolusi Canvas Client-Side
 * Optimasi kuota berkas:
 * - 3 Halaman: Max 1500x1125, Kualitas JPEG 0.72 (Total PDF aman < 1 MB)
 * - 20 Halaman: Max 1280x960, Kualitas JPEG 0.66 (Total PDF aman < 5 MB)
 */
function compressImageCanvas(img, rotationDegree = 0) {
  const currentTargetPages = typeof getTargetPagesForCurrentLembaga === 'function' ? getTargetPagesForCurrentLembaga() : 3;
  const isMultiPage20 = currentTargetPages > 3;

  const MAX_WIDTH = isMultiPage20 ? 1280 : 1500;
  const MAX_HEIGHT = isMultiPage20 ? 960 : 1125;
  const jpegQuality = isMultiPage20 ? 0.66 : 0.72;

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > height) {
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
  } else {
    if (height > MAX_HEIGHT) {
      width = Math.round((width * MAX_HEIGHT) / height);
      height = MAX_HEIGHT;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (rotationDegree === 90 || rotationDegree === 270) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotationDegree * Math.PI) / 180);

  if (rotationDegree === 90 || rotationDegree === 270) {
    ctx.drawImage(img, -height / 2, -width / 2, height, width);
  } else {
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
  }
  ctx.restore();

  return canvas.toDataURL('image/jpeg', jpegQuality);
}

/**
 * ==============================================================================
 * 5. PREVIEW, ROTASI & HAPUS FOTO
 * SOT: 02-USER-FLOW.md (Langkah H)
 * ==============================================================================
 */
function openPreviewModal(index) {
  activeSlotIndex = index;
  const slot = pagesState[index];
  const modal = document.getElementById('previewModal');
  const title = document.getElementById('previewModalTitle');
  const imgEl = document.getElementById('previewModalImage');

  if (title) title.textContent = `Preview Halaman ${slot.page}`;
  if (imgEl) imgEl.src = slot.dataUrl;

  modal.classList.add('active');
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  modal.classList.remove('active');
}

function rotateCurrentPhoto() {
  if (activeSlotIndex === null) return;
  const slot = pagesState[activeSlotIndex];
  if (!slot || !slot.dataUrl) return;

  showLoading('Memutar Foto...', 'Menyesuaikan rotasi 90°...');
  const img = new Image();
  img.onload = () => {
    const newRotatedData = compressImageCanvas(img, 90);
    slot.dataUrl = newRotatedData;
    
    const previewImg = document.getElementById('previewModalImage');
    if (previewImg) previewImg.src = newRotatedData;

    renderPageSlots();
    hideLoading();
  };
  img.src = slot.dataUrl;
}

function retakeCurrentPhoto() {
  closePreviewModal();
  openCameraModal(activeSlotIndex);
}

function deleteCurrentPhoto() {
  if (activeSlotIndex === null) return;
  const slotNum = activeSlotIndex + 1;
  showAppDialog({
    title: 'Hapus Foto Halaman?',
    type: 'warning',
    message: `Apakah Anda yakin ingin menghapus foto pada Halaman ${slotNum}? Tindakan ini tidak dapat dibatalkan.`,
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    onConfirm: () => {
      pagesState[activeSlotIndex].dataUrl = null;
      pagesState[activeSlotIndex].rotation = 0;
      renderPageSlots();
      closePreviewModal();
      showAppToast(`Foto Halaman ${slotNum} telah dihapus.`, 'info');
    }
  });
}

/**
 * ==============================================================================
 * 6. CLIENT-SIDE PDF COMPILER & HTTP POST REST UPLOAD
 * SOT: 02-USER-FLOW.md, 05-API-SPEC.md, 06-BUSINESS-RULES.md
 * ==============================================================================
 */
async function startRenderAndUpload() {
  const op = getOperatorProfile();
  const validJabatan = op && (op.jabatan === 'Sekretariat' || op.jabatan === 'Komisioner');
  if (!op || !op.nama || !op.nip || !validJabatan) {
    showAppDialog({
      title: 'Identitas Diperlukan',
      type: 'warning',
      message: 'Harap lengkapi identitas operator dan pilih Jabatan (Sekretariat atau Komisioner) terlebih dahulu sebelum melakukan upload.',
      confirmText: 'Lengkapi Sekarang',
      onConfirm: () => openOperatorModal(false)
    });
    return;
  }

  const filledSlots = pagesState.filter(p => p.dataUrl !== null);
  if (filledSlots.length === 0) {
    showAppDialog({
      title: 'Halaman Masih Kosong',
      type: 'warning',
      message: 'Harap ambil minimal 1 foto halaman dokumen sebelum render.',
      confirmText: 'Mengerti'
    });
    return;
  }

  const jenisFile = document.getElementById('selectJenisFile')?.value || 'Model C-Plano';
  const lembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  const kecamatan = document.getElementById('selectKecamatan')?.value || '';
  const desa = document.getElementById('selectDesa')?.value || '';
  const tps = document.getElementById('selectTPS')?.value || '';

  if (!kecamatan || !desa || !tps) {
    showAppDialog({
      title: 'Wilayah Belum Lengkap',
      type: 'warning',
      message: 'Harap lengkapi pilihan Kecamatan, Desa, dan Nomor TPS sebelum menyimpan dokumen.',
      confirmText: 'Lengkapi Data'
    });
    return;
  }

  const fileName = updateGeneratedFilename();
  const targetPages = TARGET_HALAMAN[lembaga] || 3;

  // Jika jumlah halaman terisi kurang dari target, beri konfirmasi detil halaman kurang/hilang
  if (filledSlots.length < targetPages) {
    const kurang = targetPages - filledSlots.length;
    showAppDialog({
      title: 'Peringatan Halaman Belum Lengkap',
      type: 'warning',
      message: `Target kelengkapan dokumen <strong>${lembaga}</strong> adalah <strong>${targetPages} Halaman</strong>.<br><br>Saat ini baru ada <strong>${filledSlots.length} Halaman</strong> yang difoto (<strong>kurang ${kurang} halaman / hilang</strong>).<br><br>Dokumen akan dicatat berstatus <strong>BELUM LENGKAP</strong> pada monitoring. Apakah Anda ingin tetap menyimpannya sekarang?`,
      confirmText: 'Tetap Simpan',
      cancelText: 'Lengkapi Dulu',
      onConfirm: () => proceedRenderAndUpload(filledSlots, jenisFile, lembaga, kecamatan, desa, tps, fileName, op)
    });
    return;
  }

  proceedRenderAndUpload(filledSlots, jenisFile, lembaga, kecamatan, desa, tps, fileName, op);
}

async function proceedRenderAndUpload(filledSlots, jenisFile, lembaga, kecamatan, desa, tps, fileName, op) {
  try {
    showLoading('Menggabungkan Dokumen...', `Menyatukan ${filledSlots.length} halaman ke dalam PDF...`);
    updateProgress(25);

    // 1. Render PDF via jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const renderWidth = pageWidth - (margin * 2);
    const renderHeight = pageHeight - (margin * 2) - 15;

    for (let i = 0; i < filledSlots.length; i++) {
      if (i > 0) {
        doc.addPage();
      }

      const slot = filledSlots[i];
      const imgData = slot.dataUrl;

      doc.addImage(imgData, 'JPEG', margin, margin, renderWidth, renderHeight, undefined, 'FAST');

      // Watermark Stempel Wilayah & Waktu & Operator di margin bawah
      doc.setFontSize(7.5);
      doc.setTextColor(90);
      const timestampStr = new Date().toLocaleString('id-ID');
      const watermarkText = `SIMAMBIL KPU GORONTALO | ${kecamatan} - ${desa} - TPS ${formatTpsNum(tps)} | Operator: ${op.nama} (${op.nip}) | Hal ${i + 1}/${filledSlots.length} | ${timestampStr}`;
      doc.text(watermarkText, margin, pageHeight - 5);

      updateProgress(25 + Math.round(((i + 1) / filledSlots.length) * 45));
    }

    updateProgress(75);
    showLoading('Mengunggah ke Google Drive...', 'Menyimpan berkas dan mencatat rekap...');

    // 2. Konversi ke Base64 Data URI
    const pdfBase64 = doc.output('datauristring');

    // 2a. Validasi Batasan Ukuran Berkas Client-Side (Max 1 MB jika <= 3 Halaman, Max 5 MB jika > 3 Halaman)
    const targetPages = TARGET_HALAMAN[lembaga] || 3;
    const isThreePages = targetPages <= 3;
    const maxAllowedBytes = isThreePages ? (1 * 1024 * 1024) : (5 * 1024 * 1024);
    const maxMbLabel = isThreePages ? '1 MB' : '5 MB';

    const base64Clean = pdfBase64.indexOf(',') > -1 ? pdfBase64.split(',')[1] : pdfBase64;
    const actualSizeBytes = Math.round((base64Clean.length * 3) / 4);

    if (actualSizeBytes > maxAllowedBytes) {
      const actualMb = (actualSizeBytes / (1024 * 1024)).toFixed(2);
      hideLoading();
      showAppDialog({
        title: 'Ukuran Berkas Melebihi Kuota',
        type: 'error',
        message: `Ukuran dokumen PDF yang dihasilkan adalah <strong>${actualMb} MB</strong>.<br><br>Batas kuota maksimal untuk lembaga <strong>${escapeHtml(lembaga)}</strong> (${targetPages} Halaman) adalah <strong>${maxMbLabel}</strong>.<br><br>Silakan periksa kembali foto dokumen atau kurangi resolusi sebelum mengunggah.`,
        confirmText: 'Kembali'
      });
      return;
    }

    const payload = {
      action: 'uploadDocument',
      token: AppConfig.getAuthToken ? AppConfig.getAuthToken() : '',
      fileName: fileName,
      mimeType: 'application/pdf',
      base64Data: pdfBase64,
      metadata: {
        jenisFile: jenisFile,
        lembaga: lembaga,
        kecamatan: kecamatan,
        desa: desa,
        tps: formatTpsNum(tps),
        totalHalaman: filledSlots.length,
        operator: {
          nama: op.nama,
          nip: op.nip,
          jabatan: op.jabatan
        }
      }
    };

    // 3. Kirim ke REST API Google Apps Script
    const apiUrl = AppConfig.getApiUrl();

    if (apiUrl) {
      let resJson = null;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });
        resJson = await response.json();
      } catch (postErr) {
        console.warn('Gagal upload ke endpoint utama, mencoba direct URL:', postErr);
        if (apiUrl !== DIRECT_GAS_URL && typeof DIRECT_GAS_URL !== 'undefined') {
          const response2 = await fetch(DIRECT_GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
          });
          resJson = await response2.json();
        } else {
          throw postErr;
        }
      }

      onUploadSuccess(resJson);

    } else {
      // Mock upload simulator jika URL belum diisi
      setTimeout(() => {
        onUploadSuccess({
          status: 'success',
          message: 'Simulasi: Dokumen berhasil di-render secara lokal (koneksi ke Google Drive sedang offline)',
          fileName: fileName
        });
      }, 1500);
    }

  } catch (err) {
    hideLoading();
    showAppDialog({
      title: 'Gagal Memproses',
      type: 'error',
      message: 'Terjadi kesalahan saat memproses upload: ' + escapeHtml(err.message),
      confirmText: 'Tutup'
    });
  }
}

function onUploadSuccess(res) {
  updateProgress(100);
  hideLoading();

  if (res && res.status === 'success') {
    initPagesState();
    renderPageSlots();
    loadRekapData();

    const driveLink = res.fileUrl ? `<br><br><a href="${res.fileUrl}" target="_blank" style="color:var(--kpu-maroon); font-weight:700; text-decoration:underline;">Buka Berkas di Google Drive</a>` : '';
    showAppDialog({
      title: 'Dokumen Berhasil Diunggah!',
      type: 'success',
      message: `${escapeHtml(res.message || 'Berkas telah berhasil disimpan ke Google Drive.')}<br><br><div style="font-family:monospace; font-size:11.5px; background:#F8FAFC; border:1px solid #E2E8F0; padding:6px 10px; border-radius:8px; word-break:break-all; color:#1E293B;">${escapeHtml(res.fileName || '')}</div>${driveLink}`,
      confirmText: 'Selesai'
    });
  } else {
    showAppDialog({
      title: 'Gagal Mengunggah',
      type: 'error',
      message: 'Gagal mengunggah berkas: ' + escapeHtml(res?.message || 'Kesalahan sistem backend.'),
      confirmText: 'Tutup'
    });
  }
}

/**
 * ==============================================================================
 * 7. MODUL REKAPITULASI & MONITORING WILAYAH (REST API)
 * SOT: 03-UI-GUIDELINE.md & 05-API-SPEC.md (GET ?action=getMonitoringSummary)
 * ==============================================================================
 */
function onRekapKecamatanChange() {
  const filterKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const filterDesa = document.getElementById('filterRekapDesa');

  if (!filterDesa) return;
  filterDesa.innerHTML = '<option value="">-- Semua Desa --</option>';

  if (filterKec && masterDataCache) {
    const kecObj = masterDataCache.wilayah.find(w => w.kecamatan === filterKec);
    if (kecObj && kecObj.desaList) {
      kecObj.desaList.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.desa;
        opt.textContent = d.desa;
        filterDesa.appendChild(opt);
      });
    }
  }

  loadRekapData();
  syncAllPickers();
}

async function loadRekapData() {
  const filterKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const filterDesa = document.getElementById('filterRekapDesa')?.value || '';
  const apiUrl = AppConfig.getApiUrl();

  const qParams = new URLSearchParams({
    action: 'getMonitoringSummary',
    kecamatan: filterKec,
    desa: filterDesa
  });

  const authToken = AppConfig.getAuthToken ? AppConfig.getAuthToken() : '';
  if (authToken) {
    qParams.append('token', authToken);
  }

  // 1. Coba endpoint utama
  if (apiUrl) {
    try {
      const endpoint = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${qParams.toString()}`;
      const res = await fetch(endpoint, { redirect: 'follow' });
      const json = await res.json();
      if (json && json.status === 'success') {
        onRekapDataLoaded(json);
        return;
      }
    } catch (e) {
      console.warn('Gagal memuat rekapitulasi dari endpoint utama:', e);
    }
  }

  // 2. Fallback ke Direct URL jika endpoint utama adalah proxy
  if (apiUrl !== DIRECT_GAS_URL && typeof DIRECT_GAS_URL !== 'undefined') {
    try {
      const directEndpoint = `${DIRECT_GAS_URL}?${qParams.toString()}`;
      const res = await fetch(directEndpoint, { redirect: 'follow' });
      const json = await res.json();
      if (json && json.status === 'success') {
        onRekapDataLoaded(json);
        return;
      }
    } catch (e2) {
      console.warn('Fallback direct GAS URL rekap juga gagal:', e2);
    }
  }

  const fallback = getLocalFallbackMonitoring(filterKec, filterDesa);
  onRekapDataLoaded(fallback);
}

function onRekapDataLoaded(res) {
  if (!res || res.status !== 'success') return;

  const statTotal = document.getElementById('statTotalTPS');
  const statLengkap = document.getElementById('statLengkap');
  const statBelum = document.getElementById('statBelumLengkap');
  const statKosong = document.getElementById('statKosong');

  if (statTotal) statTotal.textContent = res.summary.totalTPS || 0;
  if (statLengkap) statLengkap.textContent = res.summary.lengkap || 0;
  if (statBelum) statBelum.textContent = res.summary.belumLengkap || 0;
  if (statKosong) statKosong.textContent = res.summary.kosong || 0;

  allRekapRecords = res.records || [];
  rekapKecamatanList = res.rekapKecamatan || [];

  renderRekapWilayah();
  renderRekapList();
}

function switchRekapViewMode(mode) {
  currentRekapViewMode = mode;
  const btnWilayah = document.getElementById('btnViewWilayah');
  const btnTPS = document.getElementById('btnViewTPS');
  const viewWilayah = document.getElementById('viewWilayahContainer');
  const viewTPS = document.getElementById('viewTPSContainer');

  if (mode === 'wilayah') {
    btnWilayah?.classList.add('active');
    btnTPS?.classList.remove('active');
    if (viewWilayah) viewWilayah.style.display = 'block';
    if (viewTPS) viewTPS.style.display = 'none';
    renderRekapWilayah();
  } else {
    btnTPS?.classList.add('active');
    btnWilayah?.classList.remove('active');
    if (viewTPS) viewTPS.style.display = 'block';
    if (viewWilayah) viewWilayah.style.display = 'none';
    renderRekapList();
  }
}

function filterRekapWilayah(filter) {
  currentWilayahFilter = filter;
  currentRekapFilterStatus = 'ALL';

  const btns = ['btnFilterPendingWilayah', 'btnFilterAll', 'btnFilterKosong', 'btnFilterBelum', 'btnFilterLengkap'];
  btns.forEach(id => {
    document.getElementById(id)?.classList.remove('btn-gold');
  });

  if (filter === 'PENDING') {
    document.getElementById('btnFilterPendingWilayah')?.classList.add('btn-gold');
  } else {
    document.getElementById('btnFilterAll')?.classList.add('btn-gold');
  }

  renderRekapWilayah();
  renderRekapList();
}

function filterRekapStatus(status) {
  currentRekapFilterStatus = status;
  currentWilayahFilter = status;
  
  const btns = ['btnFilterPendingWilayah', 'btnFilterAll', 'btnFilterKosong', 'btnFilterBelum', 'btnFilterLengkap'];
  btns.forEach(id => {
    document.getElementById(id)?.classList.remove('btn-gold');
  });

  if (status === 'ALL') document.getElementById('btnFilterAll')?.classList.add('btn-gold');
  if (status === 'KOSONG') document.getElementById('btnFilterKosong')?.classList.add('btn-gold');
  if (status === 'BELUM LENGKAP') document.getElementById('btnFilterBelum')?.classList.add('btn-gold');
  if (status === 'LENGKAP') document.getElementById('btnFilterLengkap')?.classList.add('btn-gold');

  renderRekapWilayah();
  renderRekapList();
}

function getAggregatedRekapKecamatan() {
  if (rekapKecamatanList && rekapKecamatanList.length > 0) {
    return rekapKecamatanList;
  }

  const kecMap = new Map();
  allRekapRecords.forEach(rec => {
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

  const list = [];
  kecMap.forEach(kObj => {
    const desaList = [];
    kObj.desaMap.forEach(dObj => {
      desaList.push(dObj);
    });
    desaList.sort((a, b) => a.desa.localeCompare(b.desa));

    list.push({
      kecamatan: kObj.kecamatan,
      totalTPS: kObj.totalTPS,
      lengkap: kObj.lengkap,
      belumLengkap: kObj.belumLengkap,
      kosong: kObj.kosong,
      persenLengkap: kObj.totalTPS > 0 ? Math.round((kObj.lengkap / kObj.totalTPS) * 100) : 0,
      desaList: desaList
    });
  });

  list.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));
  rekapKecamatanList = list;
  return list;
}

function onWilayahSearch() {
  renderRekapWilayah();
}

function renderRekapWilayah() {
  const container = document.getElementById('rekapWilayahContainer');
  const countLabel = document.getElementById('wilayahCountLabel');
  const searchKeyword = (document.getElementById('wilayahSearchInput')?.value || '').trim().toLowerCase();

  if (!container) return;

  const data = getAggregatedRekapKecamatan();

  let filtered = data.filter(k => {
    if (currentWilayahFilter === 'PENDING') {
      return k.kosong > 0 || k.belumLengkap > 0;
    }
    if (currentWilayahFilter === 'KOSONG' || currentRekapFilterStatus === 'KOSONG') {
      return k.kosong > 0;
    }
    if (currentWilayahFilter === 'BELUM LENGKAP' || currentRekapFilterStatus === 'BELUM LENGKAP') {
      return k.belumLengkap > 0;
    }
    if (currentWilayahFilter === 'LENGKAP' || currentRekapFilterStatus === 'LENGKAP') {
      return k.kosong === 0 && k.belumLengkap === 0 && k.lengkap > 0;
    }
    return true;
  });

  if (searchKeyword) {
    filtered = filtered.filter(k => {
      const matchKec = k.kecamatan.toLowerCase().includes(searchKeyword);
      const matchDesa = k.desaList.some(d => d.desa.toLowerCase().includes(searchKeyword));
      return matchKec || matchDesa;
    });
  }

  const countPendingKec = data.filter(k => k.kosong > 0 || k.belumLengkap > 0).length;
  const countPendingTPS = data.reduce((acc, k) => acc + k.kosong + k.belumLengkap, 0);

  if (countLabel) {
    countLabel.textContent = `Menampilkan ${filtered.length} Kecamatan`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        ${currentWilayahFilter === 'PENDING' ? '🎉 Seluruh wilayah telah tuntas diunggah!' : 'Tidak ada data kecamatan yang cocok dengan kriteria filter.'}
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  // Banner ringkasan jika ada wilayah belum diunggah
  if (countPendingKec > 0 && currentWilayahFilter === 'PENDING') {
    const alertBox = document.createElement('div');
    alertBox.className = 'rekap-missing-alert';
    alertBox.style.marginBottom = '10px';
    alertBox.innerHTML = `
      <div style="font-weight: 700; display: flex; align-items: center; gap: 5px;">
        <span>🚨 Terdeteksi ${countPendingKec} Kecamatan (${countPendingTPS} TPS) Belum Selesai Diunggah:</span>
      </div>
      <div style="font-size: 10.5px; color: #881337; margin-top: 2px;">
        Ketuk tanda panah (▾) pada kecamatan untuk membuka rincian desa dan nomor TPS.
      </div>
    `;
    container.appendChild(alertBox);
  }

  filtered.forEach(k => {
    const card = document.createElement('div');
    const isPending = k.kosong > 0 || k.belumLengkap > 0;
    card.className = 'wilayah-card' + (isPending ? ' has-pending' : ' is-complete');

    let desaRowsHtml = '';
    k.desaList.forEach(d => {
      let tpsBadgesHtml = '';
      if (d.kosong > 0) {
        tpsBadgesHtml += `<span class="wilayah-pill kosong">🔴 ${d.kosong} TPS Kosong (${d.tpsKosong.map(t => 'TPS ' + t).join(', ')})</span>`;
      }
      if (d.belumLengkap > 0) {
        tpsBadgesHtml += `<span class="wilayah-pill belum" style="margin-left: 4px;">🟡 ${d.belumLengkap} TPS Belum Lengkap (${d.tpsBelumLengkap.map(t => 'TPS ' + t).join(', ')})</span>`;
      }
      if (d.lengkap > 0) {
        tpsBadgesHtml += `<span class="wilayah-pill lengkap" style="margin-left: 4px;">🟢 ${d.lengkap} TPS Selesai</span>`;
      }

      const targetTps = d.tpsKosong.length > 0 ? d.tpsKosong[0] : (d.tpsBelumLengkap.length > 0 ? d.tpsBelumLengkap[0] : '');
      const btnUpload = targetTps ? `
        <button type="button" class="btn-upload-direct" onclick="event.stopPropagation(); selectTPSFromRekap('${escapeJs(k.kecamatan)}', '${escapeJs(d.desa)}', '${escapeJs(targetTps)}')">
          Foto TPS ${targetTps} 📸
        </button>
      ` : '';

      desaRowsHtml += `
        <div class="wilayah-desa-item">
          <div>
            <div style="font-weight: 700; color: #1e293b;">Desa ${escapeHtml(d.desa)}</div>
            <div style="margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px;">${tpsBadgesHtml}</div>
          </div>
          <div>${btnUpload}</div>
        </div>
      `;
    });

    const cardId = `wilayah_${escapeJs(k.kecamatan)}`.replace(/[^a-zA-Z0-9_]/g, '_');

    card.innerHTML = `
      <div class="wilayah-header" onclick="toggleWilayahDesa('${cardId}', this)">
        <div style="flex: 1;">
          <div class="wilayah-title">
            <span>📍 Kec. ${escapeHtml(k.kecamatan)}</span>
            ${k.kosong > 0 ? `<span class="wilayah-pill kosong">🔴 ${k.kosong} Kosong</span>` : ''}
            ${k.belumLengkap > 0 ? `<span class="wilayah-pill belum">🟡 ${k.belumLengkap} Belum</span>` : ''}
            ${k.lengkap === k.totalTPS && k.totalTPS > 0 ? `<span class="wilayah-pill lengkap">🟢 Tuntas</span>` : ''}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            Total: <strong>${k.totalTPS} TPS</strong> • Selesai: <strong>${k.lengkap}/${k.totalTPS} (${k.persenLengkap}%)</strong>
          </div>
        </div>
        <div>
          <span class="arrow-icon" style="font-size: 14px; color: var(--kpu-maroon); font-weight: 800;">▾</span>
        </div>
      </div>
      <div class="wilayah-progress-bg">
        <div class="wilayah-progress-fill" style="width: ${k.persenLengkap}%;"></div>
      </div>
      <div id="${cardId}" class="wilayah-desa-list">
        ${desaRowsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function toggleWilayahDesa(cardId, headerEl) {
  const el = document.getElementById(cardId);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  if (isOpen) {
    el.classList.remove('open');
    const arrow = headerEl?.querySelector('.arrow-icon');
    if (arrow) arrow.textContent = '▾';
  } else {
    el.classList.add('open');
    const arrow = headerEl?.querySelector('.arrow-icon');
    if (arrow) arrow.textContent = '▴';
  }
}

function onRekapSearch() {
  renderRekapList();
}

function renderRekapList() {
  const container = document.getElementById('rekapListContainer');
  const countLabel = document.getElementById('rekapCountLabel');
  const searchKeyword = (document.getElementById('rekapSearchInput')?.value || '').trim().toLowerCase();

  if (!container) return;

  let filtered = allRekapRecords.filter(r => {
    if (currentRekapFilterStatus !== 'ALL' && r.status !== currentRekapFilterStatus) {
      return false;
    }
    if (searchKeyword) {
      const matchKec = r.kecamatan.toLowerCase().includes(searchKeyword);
      const matchDesa = r.desa.toLowerCase().includes(searchKeyword);
      const matchTps = ('tps ' + r.tps).includes(searchKeyword) || r.tps.includes(searchKeyword);
      return matchKec || matchDesa || matchTps;
    }
    return true;
  });

  if (countLabel) {
    countLabel.textContent = `Menampilkan ${filtered.length} TPS`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        Tidak ada data TPS yang cocok dengan kriteria filter.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.slice(0, 100).forEach(rec => {
    const card = document.createElement('div');
    card.className = 'rekap-item-card';

    let badgeClass = 'kosong';
    let statusIcon = '🔴';
    if (rec.status === 'LENGKAP') {
      badgeClass = 'lengkap';
      statusIcon = '🟢';
    } else if (rec.status === 'BELUM LENGKAP') {
      badgeClass = 'belum';
      statusIcon = '🟡';
    }

    const totalLengkap = rec.totalLengkap !== undefined ? rec.totalLengkap : (rec.status === 'LENGKAP' ? 7 : (rec.totalUpload || 0));

    // Analisis apakah ada dokumen yang halamannya hilang / kurang dari target
    const targetKeys = ['PPWP', 'DPD-RI', 'DPR-RI', 'DPRD-PROV', 'DPRD-KAB', 'PILGUB', 'PILBUP'];
    const missingDocs = [];

    targetKeys.forEach(k => {
      const detail = rec.detailHalaman && rec.detailHalaman[k];
      const targetHal = TARGET_HALAMAN[k] || 3;
      if (detail && detail.actual > 0 && detail.actual < targetHal) {
        missingDocs.push({
          kode: k,
          nama: SHORT_LEMBAGA_NAMES[k] || k,
          fullName: NAMA_LEMBAGA_FULL[k] || k,
          actual: detail.actual,
          target: targetHal,
          kurang: detail.kurang !== undefined ? detail.kurang : (targetHal - detail.actual)
        });
      }
    });

    // Alert Banner jika ada dokumen yang halamannya hilang / kurang
    let alertBannerHtml = '';
    if (missingDocs.length > 0) {
      alertBannerHtml = `
        <div class="rekap-missing-alert">
          <div class="rekap-missing-title">
            <span>⚠️ Terdeteksi Berkas Halaman Kurang / Hilang:</span>
          </div>
          ${missingDocs.map(m => `
            <div class="rekap-missing-item">
              <span class="rekap-missing-text">${escapeHtml(m.fullName)}</span>
              <span class="rekap-missing-count">${m.actual}/${m.target} Hal (Kurang ${m.kurang} Hal)</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Mini Chips 7 Lembaga
    let chipsHtml = '<div class="rekap-chips-row">';
    targetKeys.forEach(k => {
      const short = SHORT_LEMBAGA_NAMES[k] || k;
      const targetHal = TARGET_HALAMAN[k] || 3;
      const detail = rec.detailHalaman && rec.detailHalaman[k];

      let isCompleted = false;
      let actualHal = 0;
      let kurangHal = targetHal;
      if (detail) {
        actualHal = detail.actual || 0;
        isCompleted = detail.lengkap;
        kurangHal = detail.kurang !== undefined ? detail.kurang : (targetHal - actualHal);
      } else if (rec.rincian) {
        isCompleted = !!rec.rincian[k];
        actualHal = isCompleted ? targetHal : 0;
        kurangHal = isCompleted ? 0 : targetHal;
      }

      let chipClass = 'kosong';
      let icon = '';
      let chipText = `${short}: ${actualHal}/${targetHal}`;
      if (isCompleted) {
        chipClass = 'lengkap';
        icon = '✓ ';
      } else if (actualHal > 0) {
        chipClass = 'kurang';
        icon = '⚠️ ';
        chipText = `${short}: ${actualHal}/${targetHal} (-${kurangHal} Hal)`;
      }

      chipsHtml += `<span class="rekap-chip ${chipClass}">${icon}${chipText}</span>`;
    });
    chipsHtml += '</div>';

    // Rincian Breakdown Card (Expandable)
    const cardId = `breakdown_${rec.kecamatan}_${rec.desa}_${rec.tps}`.replace(/[^a-zA-Z0-9_]/g, '_');
    let breakdownRowsHtml = '';
    targetKeys.forEach(k => {
      const fullName = NAMA_LEMBAGA_FULL[k] || k;
      const targetHal = TARGET_HALAMAN[k] || 3;
      const detail = rec.detailHalaman && rec.detailHalaman[k];
      const actualHal = detail ? detail.actual : (rec.rincian && rec.rincian[k] ? targetHal : 0);
      const isCompleted = detail ? detail.lengkap : (rec.rincian && rec.rincian[k]);
      const kurangHal = detail && detail.kurang !== undefined ? detail.kurang : (targetHal - actualHal);

      let badgeHtml = '';
      if (isCompleted) {
        badgeHtml = `<span style="font-size: 10px; font-weight: 700; color: #15803d; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">🟢 ${actualHal}/${targetHal} Hal (Lengkap)</span>`;
      } else if (actualHal > 0) {
        badgeHtml = `<span style="font-size: 10px; font-weight: 700; color: #be123c; background: #ffe4e6; padding: 2px 6px; border-radius: 4px;">⚠️ ${actualHal}/${targetHal} Hal (Kurang ${kurangHal} Hal)</span>`;
      } else {
        badgeHtml = `<span style="font-size: 10px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">⚪ 0/${targetHal} Hal (Belum)</span>`;
      }

      const btnLabel = actualHal > 0 && !isCompleted ? 'Lengkapi 📸' : (isCompleted ? 'Ulang 📸' : 'Foto 📸');

      breakdownRowsHtml += `
        <div class="breakdown-row">
          <div class="breakdown-row-left">
            <span class="breakdown-name">${escapeHtml(fullName)}</span>
            <span class="breakdown-sub">Target: ${targetHal} Halaman</span>
          </div>
          <div class="breakdown-row-right">
            ${badgeHtml}
            <button type="button" class="btn-upload-direct" onclick="event.stopPropagation(); selectTPSAndLembagaFromRekap('${escapeJs(rec.kecamatan)}', '${escapeJs(rec.desa)}', '${escapeJs(rec.tps)}', '${k}')">
              ${btnLabel}
            </button>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="rekap-item-top" onclick="selectTPSFromRekap('${escapeJs(rec.kecamatan)}', '${escapeJs(rec.desa)}', '${escapeJs(rec.tps)}')">
        <div class="rekap-item-left">
          <span class="rekap-tps-title">TPS ${rec.tps} - ${rec.desa}</span>
          <span class="rekap-tps-sub">Kec. ${rec.kecamatan} • Kelengkapan: <strong>${totalLengkap}/7 Lembaga</strong></span>
        </div>
        <div>
          <span class="status-badge ${badgeClass}" style="white-space: nowrap;">${statusIcon} ${rec.status}</span>
        </div>
      </div>
      ${alertBannerHtml}
      ${chipsHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 4px; margin-top: 2px;">
        <button type="button" class="rekap-toggle-btn" onclick="event.stopPropagation(); toggleRekapBreakdown('${cardId}', this)">
          <span>📋 Rincian Halaman 7 Lembaga</span> <span class="arrow-icon">▾</span>
        </button>
        <span style="font-size: 10px; color: var(--text-muted); cursor: pointer;" onclick="selectTPSFromRekap('${escapeJs(rec.kecamatan)}', '${escapeJs(rec.desa)}', '${escapeJs(rec.tps)}')">Ketuk kartu untuk pilih TPS</span>
      </div>
      <div id="${cardId}" class="rekap-breakdown-card">
        ${breakdownRowsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function selectTPSAndLembagaFromRekap(kec, desa, tps, kodeLembaga) {
  selectTPSFromRekap(kec, desa, tps);
  const selectLembaga = document.getElementById('selectLembaga');
  if (selectLembaga && kodeLembaga) {
    selectLembaga.value = kodeLembaga;
    onLembagaSelectionChanged();
  }
  const slotsSec = document.getElementById('cardSlots');
  if (slotsSec) {
    slotsSec.scrollIntoView({ behavior: 'smooth' });
  }
}

function toggleRekapBreakdown(cardId, btn) {
  const el = document.getElementById(cardId);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  if (isOpen) {
    el.classList.remove('open');
    if (btn) {
      const arrow = btn.querySelector('.arrow-icon');
      if (arrow) arrow.textContent = '▾';
    }
  } else {
    el.classList.add('open');
    if (btn) {
      const arrow = btn.querySelector('.arrow-icon');
      if (arrow) arrow.textContent = '▴';
    }
  }
}

function escapeJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function selectTPSFromRekap(kec, desa, tps) {
  switchTab('camera');

  const selectKec = document.getElementById('selectKecamatan');
  if (selectKec) {
    selectKec.value = kec;
    onKecamatanChanged();
  }

  const selectDesa = document.getElementById('selectDesa');
  if (selectDesa) {
    selectDesa.value = desa;
    onDesaChanged();
  }

  const selectTPS = document.getElementById('selectTPS');
  if (selectTPS) {
    selectTPS.value = tps;
    updateGeneratedFilename();
  }

  syncAllPickers();
  window.scrollTo({ top: 180, behavior: 'smooth' });
}

/**
 * ==============================================================================
 * 8. NAVIGATION & UTILITIES
 * ==============================================================================
 */
function switchTab(tabName) {
  const cameraPanel = document.getElementById('cameraPanel');
  const rekapPanel = document.getElementById('rekapPanel');
  const navCamera = document.getElementById('navCamera');
  const navRekap = document.getElementById('navRekap');

  if (tabName === 'camera') {
    cameraPanel?.classList.add('active');
    rekapPanel?.classList.remove('active');
    navCamera?.classList.add('active');
    navRekap?.classList.remove('active');
  } else {
    cameraPanel?.classList.remove('active');
    rekapPanel?.classList.add('active');
    navCamera?.classList.remove('active');
    navRekap?.classList.add('active');
    loadRekapData();
  }
}

function showLoading(title, desc) {
  const overlay = document.getElementById('loadingOverlay');
  const titleEl = document.getElementById('loadingTitle');
  const descEl = document.getElementById('loadingDesc');
  const bar = document.getElementById('progressBarFill');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (bar) bar.style.width = '10%';
  if (overlay) overlay.classList.add('active');
}

function updateProgress(percent) {
  const bar = document.getElementById('progressBarFill');
  if (bar) bar.style.width = percent + '%';
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

function setupNetworkListeners() {
  const statusEl = document.getElementById('connStatus');
  window.addEventListener('online', () => {
    if (statusEl) statusEl.textContent = 'ONLINE';
  });
  window.addEventListener('offline', () => {
    if (statusEl) statusEl.textContent = 'OFFLINE';
  });
}

function registerPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('PWA ServiceWorker note:', err);
    });
  }
}

/**
 * Master Data Cadangan (Fallback) - Tanpa Data Dummy
 */
function getLocalFallbackMasterData() {
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

function getLocalFallbackMonitoring(filterKec, filterDesa) {
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

/**
 * ==============================================================================
 * 9. CUSTOM MOBILE BOTTOM SHEET PICKER (MODERN ANDROID UX)
 * Replaces ugly dark Android OS system radio picker with a sleek bottom sheet
 * ==============================================================================
 */
let currentPickerSelectId = null;

const PICKER_FIELD_MAP = [
  { selectId: 'selectJenisFile', labelId: 'labelJenisFile', triggerId: 'triggerJenisFile' },
  { selectId: 'selectLembaga', labelId: 'labelLembaga', triggerId: 'triggerLembaga' },
  { selectId: 'selectKecamatan', labelId: 'labelKecamatan', triggerId: 'triggerKecamatan' },
  { selectId: 'selectDesa', labelId: 'labelDesa', triggerId: 'triggerDesa' },
  { selectId: 'selectTPS', labelId: 'labelTPS', triggerId: 'triggerTPS' },
  { selectId: 'filterRekapKecamatan', labelId: 'labelFilterRekapKecamatan', triggerId: 'triggerFilterRekapKecamatan' },
  { selectId: 'filterRekapDesa', labelId: 'labelFilterRekapDesa', triggerId: 'triggerFilterRekapDesa' },
  { selectId: 'selectOpJabatan', labelId: 'labelOpJabatan', triggerId: 'triggerOpJabatan' }
];

function syncAllPickers() {
  PICKER_FIELD_MAP.forEach(({ selectId, labelId, triggerId }) => {
    const sel = document.getElementById(selectId);
    const lbl = document.getElementById(labelId);
    const trig = document.getElementById(triggerId);
    if (!sel || !lbl) return;

    const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const txt = opt ? opt.textContent : (sel.getAttribute('placeholder') || '-- Pilih --');
    lbl.textContent = txt;

    if (trig) {
      if (sel.disabled) {
        trig.classList.add('disabled');
        trig.setAttribute('aria-disabled', 'true');
      } else {
        trig.classList.remove('disabled');
        trig.removeAttribute('aria-disabled');
      }
    }
  });
}

function triggerPicker(selectId, title, icon = '📍', hasSearch = true) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.disabled) {
    if (selectId === 'selectDesa') {
      showAppToast('Harap pilih Kecamatan terlebih dahulu.', 'warning');
    } else if (selectId === 'selectTPS') {
      showAppToast('Harap pilih Desa terlebih dahulu.', 'warning');
    }
    return;
  }

  currentPickerSelectId = selectId;
  const modal = document.getElementById('bottomSheetPickerModal');
  const titleEl = document.getElementById('pickerHeaderTitle');
  const iconEl = document.getElementById('pickerHeaderIcon');
  const searchWrapper = document.getElementById('pickerSearchWrapper');
  const searchInput = document.getElementById('pickerSearchInput');

  if (titleEl) titleEl.textContent = title;
  if (iconEl) iconEl.textContent = icon;

  if (searchWrapper) {
    searchWrapper.style.display = hasSearch ? 'block' : 'none';
  }
  if (searchInput) {
    searchInput.value = '';
    const clearBtn = document.getElementById('pickerSearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  }

  renderPickerOptions('');
  if (modal) modal.classList.add('active');

  if (hasSearch && searchInput) {
    setTimeout(() => searchInput.focus(), 250);
  }
}

function renderPickerOptions(searchKeyword = '') {
  const listEl = document.getElementById('pickerOptionsList');
  if (!listEl || !currentPickerSelectId) return;

  const sel = document.getElementById(currentPickerSelectId);
  if (!sel) return;

  const currentVal = sel.value;
  const options = Array.from(sel.options);
  const keyword = (searchKeyword || '').trim().toLowerCase();

  listEl.innerHTML = '';

  let count = 0;
  options.forEach(opt => {
    // Lewatkan opsi placeholder kosong jika ada opsi riil dan pengguna sedang tidak mencari
    if (!opt.value && options.length > 1 && keyword === '' && (currentPickerSelectId.startsWith('select') || currentPickerSelectId.startsWith('filter'))) {
      // Izinkan placeholder untuk filter monitoring (misal "Semua Kecamatan")
      if (!currentPickerSelectId.startsWith('filter')) {
        return;
      }
    }

    const text = opt.textContent;
    if (keyword && !text.toLowerCase().includes(keyword)) {
      return;
    }

    count++;
    const isSelected = opt.value === currentVal;
    const item = document.createElement('div');
    item.className = 'picker-option-item' + (isSelected ? ' selected' : '');
    item.onclick = () => selectPickerOption(currentPickerSelectId, opt.value);

    item.innerHTML = `
      <span class="picker-option-label">${escapeHtml(text)}</span>
      ${isSelected ? '<div class="picker-check-badge">✓</div>' : ''}
    `;

    listEl.appendChild(item);
  });

  if (count === 0) {
    listEl.innerHTML = `
      <div class="picker-empty-state">
        Tidak ada opsi yang cocok dengan "${escapeHtml(keyword)}".
      </div>
    `;
  }
}

function onPickerSearchInput(query) {
  const clearBtn = document.getElementById('pickerSearchClearBtn');
  if (clearBtn) {
    clearBtn.style.display = query ? 'block' : 'none';
  }
  renderPickerOptions(query);
}

function clearPickerSearch() {
  const input = document.getElementById('pickerSearchInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('pickerSearchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  renderPickerOptions('');
}

function selectPickerOption(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  sel.value = value;
  sel.dispatchEvent(new Event('change'));
  syncAllPickers();
  closeBottomSheetPicker();
}

function closeBottomSheetPicker(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('bottomSheetPickerModal');
  if (modal) modal.classList.remove('active');
  currentPickerSelectId = null;
}
