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

// Pemisahan Kategori Pemilihan: Pemilu (5 Lembaga) vs Pilkada (2 Lembaga)
const KATEGORI_LEMBAGA_MAP = {
  'PEMILU': ['PPWP', 'DPR-RI', 'DPD-RI', 'DPRD-PROV', 'DPRD-KAB'],
  'PILKADA': ['PILGUB', 'PILBUP']
};

const LEMBAGA_OPTIONS_BY_KATEGORI = {
  'PEMILU': [
    { value: 'PPWP', label: '1. PPWP (Presiden & Wapres)' },
    { value: 'DPR-RI', label: '2. DPR RI' },
    { value: 'DPD-RI', label: '3. DPD RI' },
    { value: 'DPRD-PROV', label: '4. DPRD Provinsi' },
    { value: 'DPRD-KAB', label: '5. DPRD Kabupaten/Kota' }
  ],
  'PILKADA': [
    { value: 'PILGUB', label: '1. Gubernur & Wagub (PILGUB)' },
    { value: 'PILBUP', label: '2. Bupati & Wabup (PILBUP)' }
  ]
};

function getKategoriForLembaga(kode) {
  return (kode === 'PILGUB' || kode === 'PILBUP') ? 'PILKADA' : 'PEMILU';
}

function getTargetKeysForCategory(kategori) {
  if (kategori === 'PILKADA') return ['PILGUB', 'PILBUP'];
  return ['PPWP', 'DPD-RI', 'DPR-RI', 'DPRD-PROV', 'DPRD-KAB'];
}

let currentRekapKategori = 'PEMILU'; // 'PEMILU' atau 'PILKADA'

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
const sessionUploadedDocsMap = new Map(); // Cache URL dokumen sesi aktif: "KEC|DESA|TPS|LEMBAGA" => { fileUrl, fileId, fileName }

// Storage Keys untuk Stale-While-Revalidate (SWR) Instant Hydration
const STORAGE_KEY_MASTER = 'SIMAMBIL_MASTER_DATA_CACHE_V2';
const STORAGE_KEY_REKAP = 'SIMAMBIL_REKAP_SUMMARY_CACHE_V3';

function getRekapStorageKey(kategori) {
  const cat = (kategori || currentRekapKategori || 'PEMILU').toUpperCase();
  return `SIMAMBIL_REKAP_SUMMARY_${cat}_V5`;
}

/**
 * Helper Fetch dengan Timeout AbortController
 * Menjamin koneksi seluler tidak menggantung tanpa batas waktu
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Hidrasi Instan dari Cache Lokal (0 Milliseconds)
 * Memastikan operator tidak pernah menunggu data wilayah atau rekapitulasi saat membuka kembali aplikasi
 */
function hydrateFromLocalCache() {
  // Bersihkan cache rekap versi lama yang mengandung anomali duplikasi 1206
  try {
    localStorage.removeItem('SIMAMBIL_REKAP_SUMMARY_CACHE_V1');
    localStorage.removeItem('SIMAMBIL_REKAP_SUMMARY_CACHE_V2');
  } catch (eClean) {}
  try {
    const cachedMasterRaw = localStorage.getItem(STORAGE_KEY_MASTER);
    if (cachedMasterRaw) {
      const cachedMaster = JSON.parse(cachedMasterRaw);
      if (cachedMaster && cachedMaster.status === 'success' && cachedMaster.wilayah && cachedMaster.wilayah.length > 0) {
        console.log('⚡ [SIMAMBIL SWR] Master data wilayah dihidrasi instan dari cache lokal (0ms)');
        handleMasterDataSuccess(cachedMaster, { fromCache: true });
      }
    }
  } catch (e) {
    console.warn('Gagal membaca cache master data:', e);
  }

  try {
    const cachedRekapRaw = localStorage.getItem(getRekapStorageKey('PEMILU')) || localStorage.getItem(STORAGE_KEY_REKAP);
    if (cachedRekapRaw) {
      const cachedRekap = JSON.parse(cachedRekapRaw);
      if (cachedRekap && cachedRekap.status === 'success' && cachedRekap.summary) {
        console.log('⚡ [SIMAMBIL SWR] Rekapitulasi monitoring dihidrasi instan dari cache lokal (0ms)');
        onRekapDataLoaded(cachedRekap, { fromCache: true });
      }
    }
  } catch (e) {
    console.warn('Gagal membaca cache rekap monitoring:', e);
  }
}

/**
 * Auto-fit Header Brand Subtitle (Baris ke-3)
 * Menyesuaikan ukuran font secara dinamis agar 100% pas dalam 1 baris di semua ukuran layar handphone
 */
function fitHeaderBrandDesc() {
  const el = document.getElementById('headerBrandDesc');
  if (!el || el.clientWidth === 0) return;
  let currentSize = 7.5;
  el.style.fontSize = currentSize + 'px';
  while (el.scrollWidth > el.clientWidth && currentSize > 4.8) {
    currentSize -= 0.15;
    el.style.fontSize = currentSize + 'px';
  }
}

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  initPagesState();
  renderPageSlots();

  // 1. Hidrasi instan dari cache lokal (0ms - Stale-While-Revalidate)
  hydrateFromLocalCache();

  // 1b. Pulihkan draft sesi kerja aktif jika aplikasi tertutup / kembali ke home (Anti-Restart)
  restoreSessionDraftIfAvailable();

  // 2. Muat data mutakhir secara paralel di latar belakang tanpa saling memblokir
  loadMasterData();
  loadRekapData();

  setupNetworkListeners();
  registerPWA();
  checkOperatorGate();
  syncAllPickers();
  updateTargetPageUI();

  // Auto-fit baris ke-3 nama aplikasi ke dalam 1 baris
  requestAnimationFrame(fitHeaderBrandDesc);
  window.addEventListener('resize', fitHeaderBrandDesc);
  window.addEventListener('orientationchange', () => setTimeout(fitHeaderBrandDesc, 150));

  // Masking input NIP: Hanya izinkan angka murni, atau tanda '-' jika jabatan Komisioner

  // Auto-Save sesi kerja saat aplikasi diminimalkan atau berpindah tab / home
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveSessionDraft();
    }
  });
  window.addEventListener('pagehide', () => saveSessionDraft());
  window.addEventListener('beforeunload', () => saveSessionDraft());

  // Perlindungan Tombol Kembali Fisik Android (Popstate)
  history.pushState({ page: 'simambil-root' }, '');
  window.addEventListener('popstate', (e) => {
    const cropModal = document.getElementById('cropDeskewModal');
    if (cropModal && cropModal.classList.contains('active')) {
      history.pushState({ page: 'simambil-root' }, '');
      cancelCropDeskew();
      return;
    }
    const camModal = document.getElementById('cameraModal');
    if (camModal && camModal.classList.contains('active')) {
      history.pushState({ page: 'simambil-root' }, '');
      closeCameraModal();
      return;
    }
    const prevModal = document.getElementById('previewModal');
    if (prevModal && prevModal.classList.contains('active')) {
      history.pushState({ page: 'simambil-root' }, '');
      closePreviewModal();
      return;
    }
    const opModal = document.getElementById('operatorModal');
    if (opModal && opModal.classList.contains('active')) {
      history.pushState({ page: 'simambil-root' }, '');
      closeOperatorModal();
      return;
    }

    const filledCount = pagesState.filter(p => p.dataUrl).length;
    if (filledCount > 0) {
      history.pushState({ page: 'simambil-root' }, '');
      showAppToast(`Sesi kerja (${filledCount} foto) tersimpan aman di perangkat.`, 'info', 2200);
    } else {
      history.pushState({ page: 'simambil-root' }, '');
    }
  });

  const inputNip = document.getElementById('inputOpNip');
  if (inputNip) {
    inputNip.addEventListener('input', function () {
      const selectJabatan = document.getElementById('selectOpJabatan');
      const isKomisioner = selectJabatan && selectJabatan.value === 'Komisioner';
      if (isKomisioner) {
        if (this.value === '-') return;
        this.value = this.value.replace(/[^0-9\-]/g, '').slice(0, 18);
      } else {
        this.value = this.value.replace(/\D/g, '').slice(0, 18);
      }
    });
  }
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

function showAppDialog({ title, message, type = 'info', confirmText = 'Mengerti', cancelText = null, onConfirm = null, onCancel = null, secondaryText = null, onSecondary = null }) {
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

    if (secondaryText) {
      actionsEl.style.flexDirection = 'column';
      actionsEl.style.gap = '8px';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn-primary';
      confirmBtn.style.width = '100%';
      confirmBtn.textContent = confirmText;
      confirmBtn.onclick = () => {
        modal.classList.remove('active');
        if (onConfirm) onConfirm();
      };
      actionsEl.appendChild(confirmBtn);

      const secBtn = document.createElement('button');
      secBtn.className = 'btn btn-secondary';
      secBtn.style.width = '100%';
      secBtn.textContent = secondaryText;
      secBtn.onclick = () => {
        modal.classList.remove('active');
        if (onSecondary) onSecondary();
      };
      actionsEl.appendChild(secBtn);

      if (cancelText) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.width = '100%';
        cancelBtn.style.background = '#f1f5f9';
        cancelBtn.style.color = '#475569';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
          modal.classList.remove('active');
          if (onCancel) onCancel();
        };
        actionsEl.appendChild(cancelBtn);
      }
    } else {
      actionsEl.style.flexDirection = 'row';
      actionsEl.style.gap = '10px';

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
  onJabatanChanged();
  if (modal) modal.classList.add('active');
}

function onJabatanChanged() {
  const selectJabatan = document.getElementById('selectOpJabatan');
  const inputNip = document.getElementById('inputOpNip');
  const nipHint = document.getElementById('nipHint');
  const isKomisioner = selectJabatan && selectJabatan.value === 'Komisioner';

  if (isKomisioner) {
    if (inputNip) {
      inputNip.placeholder = "Masukkan 18 digit NIP atau tanda '-' jika non-PNS";
      if (!inputNip.value || inputNip.value === '') {
        inputNip.value = '-';
      }
    }
    if (nipHint) {
      nipHint.textContent = "Komisioner dapat menggunakan tanda '-' jika tidak memiliki NIP.";
    }
  } else {
    if (inputNip) {
      inputNip.placeholder = "Contoh: 199003212024211015 (18 digit angka)";
      if (inputNip.value === '-') {
        inputNip.value = '';
      }
    }
    if (nipHint) {
      nipHint.textContent = "Sekretariat KPU wajib mengisikan 18 digit angka NIP resmi.";
    }
  }
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
  const nipRaw = (document.getElementById('inputOpNip')?.value || '').trim();
  const jabatan = (document.getElementById('selectOpJabatan')?.value || '').trim();

  if (!nama || !nipRaw || (jabatan !== 'Sekretariat' && jabatan !== 'Komisioner')) {
    showAppToast('Harap lengkapi semua kolom dan pilih Jabatan!', 'warning');
    return;
  }

  // Validasi Ketat NIP:
  // - Jika Jabatan = Komisioner: Diizinkan tanda '-' (non-PNS) atau angka murni
  // - Jika Jabatan = Sekretariat: Wajib angka murni (8-18 digit)
  const nip = nipRaw.replace(/\s+/g, '');
  const isKomisioner = jabatan === 'Komisioner';
  const isDashNip = nip === '-';

  if (isKomisioner && isDashNip) {
    // Valid Komisioner non-NIP
  } else {
    if (!/^\d+$/.test(nip)) {
      showAppToast(isKomisioner ? 'NIP harus angka atau tanda "-"!' : 'NIP Sekretariat wajib berupa angka!', 'error');
      showAppDialog({
        title: 'Format NIP Ditolak',
        type: 'error',
        message: isKomisioner
          ? 'Untuk jabatan Komisioner, NIP dapat diisi dengan tanda <code>-</code> (jika non-PNS) atau berupa angka murni.'
          : 'Untuk jabatan Sekretariat, NIP wajib berupa <strong>angka murni (digit 0-9)</strong> tanpa huruf atau simbol.<br><br>Contoh NIP ASN KPU: <code>199003212024211015</code>.',
        confirmText: 'Perbaiki NIP'
      });
      return;
    }

    if (nip.length < 8 || nip.length > 18) {
      showAppToast('NIP harus terdiri dari 8 hingga 18 digit angka!', 'warning');
      showAppDialog({
        title: 'Panjang NIP Tidak Sesuai',
        type: 'warning',
        message: `Jumlah digit NIP yang Anda masukkan adalah <strong>${nip.length} digit</strong>.<br><br>NIP standar ASN KPU terdiri dari <strong>18 digit angka</strong> (contoh: <code>199003212024211015</code>). Pastikan digit yang dimasukkan benar.`,
        confirmText: 'Periksa Kembali'
      });
      return;
    }
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
  const selectedLembaga = document.getElementById('selectLembaga')?.value || '';
  if (!selectedLembaga) return 0;
  return TARGET_HALAMAN[selectedLembaga] || 3;
}

function initPagesState(numPages) {
  const targetPages = numPages !== undefined ? numPages : getTargetPagesForCurrentLembaga();
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
  if (targetPages === 0) {
    pagesState = [];
    return;
  }
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

async function loadMasterData(isManualRefresh = false) {
  const apiUrl = AppConfig.getApiUrl();
  const authToken = AppConfig.getAuthToken ? AppConfig.getAuthToken() : '';
  const tokenQuery = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
  const refreshQuery = isManualRefresh ? `&refresh=1&_t=${Date.now()}` : `&_t=${Date.now()}`;

  // 1. Coba endpoint utama (Proxy /api/gas jika di Vercel atau Direct URL)
  if (apiUrl) {
    try {
      const endpoint = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}action=getMasterData${tokenQuery}${refreshQuery}`;
      const res = await fetchWithTimeout(endpoint, { redirect: 'follow', cache: 'no-store' }, 12000);
      const json = await res.json();
      if (json && json.status === 'success') {
        handleMasterDataSuccess(json);
        try {
          localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(json));
        } catch (errStorage) {}
        return;
      }
    } catch (e) {
      console.warn('Gagal memuat master data dari endpoint utama:', e);
    }
  }

  // 2. Fallback ke Direct URL jika endpoint utama adalah proxy
  if (apiUrl !== DIRECT_GAS_URL && typeof DIRECT_GAS_URL !== 'undefined') {
    try {
      const directEndpoint = `${DIRECT_GAS_URL}?action=getMasterData${tokenQuery}${refreshQuery}`;
      const res = await fetchWithTimeout(directEndpoint, { redirect: 'follow', cache: 'no-store' }, 12000);
      const json = await res.json();
      if (json && json.status === 'success') {
        handleMasterDataSuccess(json);
        try {
          localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(json));
        } catch (errStorage) {}
        return;
      }
    } catch (e2) {
      console.warn('Fallback direct GAS URL juga gagal:', e2);
    }
  }

  // 3. Fallback lokal jika belum ada cache dan offline total
  if (!masterDataCache) {
    const fallback = getLocalFallbackMasterData();
    handleMasterDataSuccess(fallback);
  }
}

function getActiveWilayahList(kategoriOverride) {
  const kategori = (kategoriOverride || document.getElementById('selectKategoriPemilihan')?.value || currentRekapKategori || '').toUpperCase();
  if (kategori === 'PILKADA' && masterDataCache && masterDataCache.wilayahPilkada && masterDataCache.wilayahPilkada.length > 0) {
    return masterDataCache.wilayahPilkada;
  }
  return (masterDataCache && masterDataCache.wilayah) || [];
}

function handleMasterDataSuccess(res) {
  if (!res || res.status !== 'success') return;
  masterDataCache = res;

  // 1. Populasi Dropdown Kecamatan
  const selectKec = document.getElementById('selectKecamatan');
  const selectFilterKec = document.getElementById('filterRekapKecamatan');
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');

  // Pertahankan pilihan operator yang sedang aktif agar tidak ter-reset saat revalidasi latar belakang
  const currentKec = selectKec ? selectKec.value : '';
  const currentDesa = selectDesa ? selectDesa.value : '';
  const currentTPS = selectTPS ? selectTPS.value : '';
  const currentFilterKec = selectFilterKec ? selectFilterKec.value : '';
  
  if (selectKec) {
    selectKec.innerHTML = '<option value="">-- Pilih Kecamatan --</option>';
  }
  if (selectFilterKec) {
    selectFilterKec.innerHTML = '<option value="">-- Semua Kecamatan (19 Kecamatan) --</option>';
  }

  const wilayah = getActiveWilayahList();
  const allMasterWilayah = res.wilayah || [];

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
    });

    // Filter rekap selalu menampilkan seluruh 19 kecamatan SSOT
    allMasterWilayah.forEach(item => {
      if (selectFilterKec) {
        const optFilter = document.createElement('option');
        optFilter.value = item.kecamatan;
        optFilter.textContent = item.kecamatan;
        selectFilterKec.appendChild(optFilter);
      }
    });

    // Pulihkan pilihan aktif jika operator sudah memilih, atau pertahankan kosong jika belum memilih
    if (selectKec) {
      if (currentKec && wilayah.some(w => w.kecamatan === currentKec)) {
        selectKec.value = currentKec;
        onKecamatanChanged(currentDesa, currentTPS);
      } else {
        selectKec.value = '';
        if (selectDesa) {
          selectDesa.innerHTML = '<option value="">-- Pilih Kecamatan Terlebih Dahulu --</option>';
          selectDesa.disabled = true;
          selectDesa.value = '';
        }
        if (selectTPS) {
          selectTPS.innerHTML = '<option value="">-- Pilih Desa Terlebih Dahulu --</option>';
          selectTPS.disabled = true;
          selectTPS.value = '';
        }
      }
    }

    if (selectFilterKec && currentFilterKec) {
      selectFilterKec.value = currentFilterKec;
    }

    updateGeneratedFilename();
  }

  syncAllPickers();

  // Jika ringkasan monitoring belum terisi, render initial wilayah langsung dari Master Data
  if (allRekapRecords.length === 0 && (!rekapKecamatanList || rekapKecamatanList.length === 0)) {
    renderRekapWilayah();
  }
}

/**
 * Cascading Dropdown: Kecamatan -> Desa -> TPS
 * Mendukung preserve wilayah jika sedang dalam sesi dokumentasi aktif
 */
function onKecamatanChanged(preserveDesa, preserveTps) {
  const selectedKec = document.getElementById('selectKecamatan')?.value || '';
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');

  if (!selectDesa || !selectTPS) return;

  selectDesa.innerHTML = '<option value="">-- Pilih Desa / Kelurahan --</option>';
  selectTPS.innerHTML = '<option value="">-- Pilih TPS --</option>';
  selectTPS.disabled = true;

  if (!selectedKec || !masterDataCache) {
    selectDesa.disabled = true;
    selectDesa.value = '';
    selectTPS.value = '';
    updateGeneratedFilename();
    syncAllPickers();
    return;
  }

  const wilayah = getActiveWilayahList();
  const kecObj = wilayah.find(w => w.kecamatan === selectedKec);
  if (kecObj && kecObj.desaList) {
    kecObj.desaList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.desa;
      opt.textContent = d.desa;
      selectDesa.appendChild(opt);
    });
    selectDesa.disabled = false;
    
    // Jika ada permintaan preserve desa dari sesi dokumentasi aktif atau navigasi rekap
    if (preserveDesa && kecObj.desaList.some(d => d.desa === preserveDesa)) {
      selectDesa.value = preserveDesa;
      onDesaChanged(preserveTps);
    } else {
      selectDesa.value = '';
      selectTPS.value = '';
      selectTPS.disabled = true;
    }
  } else {
    selectDesa.disabled = true;
    selectDesa.value = '';
    selectTPS.value = '';
  }

  updateGeneratedFilename();
  syncAllPickers();
}

function onDesaChanged(preserveTps) {
  const selectedKec = document.getElementById('selectKecamatan')?.value || '';
  const selectedDesa = document.getElementById('selectDesa')?.value || '';
  const selectTPS = document.getElementById('selectTPS');

  if (!selectTPS) return;
  selectTPS.innerHTML = '<option value="">-- Pilih TPS --</option>';

  if (!selectedKec || !selectedDesa || !masterDataCache) {
    selectTPS.disabled = true;
    selectTPS.value = '';
    updateGeneratedFilename();
    syncAllPickers();
    return;
  }

  const wilayah = getActiveWilayahList();
  const kecObj = wilayah.find(w => w.kecamatan === selectedKec);
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

      // Jika ada permintaan preserve TPS dari sesi dokumentasi aktif atau navigasi rekap
      if (preserveTps && desaObj.tpsList.includes(preserveTps)) {
        selectTPS.value = preserveTps;
      } else {
        selectTPS.value = '';
      }
    } else {
      selectTPS.disabled = true;
      selectTPS.value = '';
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
  const jenis = document.getElementById('selectJenisFile')?.value || '';
  const lembaga = document.getElementById('selectLembaga')?.value || '';
  const kec = document.getElementById('selectKecamatan')?.value || '';
  const desa = document.getElementById('selectDesa')?.value || '';
  const tps = document.getElementById('selectTPS')?.value || '';

  const cleanJenis = jenis ? sanitizeStr(jenis) : '[JENIS]';
  const cleanLembaga = lembaga ? sanitizeStr(lembaga) : '[LEMBAGA]';
  const cleanKec = kec ? sanitizeStr(kec) : '[KEC]';
  const cleanDesa = desa ? sanitizeStr(desa) : '[DESA]';
  const cleanTps = tps ? formatTpsNum(tps) : '[TPS]';

  const previewEl = document.getElementById('previewFilename');

  if (!jenis || !lembaga || !kec || !desa || !tps) {
    const placeholder = `${cleanJenis}_${cleanLembaga}_${cleanKec}_${cleanDesa}_${cleanTps}.pdf`;
    if (previewEl) {
      previewEl.textContent = placeholder;
      previewEl.style.color = 'var(--text-muted)';
      previewEl.style.fontStyle = 'italic';
    }
    return '';
  }

  const filename = `${cleanJenis}_${cleanLembaga}_${cleanKec}_${cleanDesa}_${cleanTps}.pdf`;
  if (previewEl) {
    previewEl.textContent = filename;
    previewEl.style.color = 'var(--kpu-maroon)';
    previewEl.style.fontStyle = 'normal';
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
 * 3. MANAJEMEN KATEGORI PEMILIHAN, LEMBAGA & SLOT HALAMAN (1 - 20)
 * SOT: 03-UI-GUIDELINE.md & 06-BUSINESS-RULES.md
 * ==============================================================================
 */

function onKategoriPemilihanChanged(preserveLembaga = false) {
  const selectKategori = document.getElementById('selectKategoriPemilihan');
  const kategori = selectKategori ? selectKategori.value : '';
  applyKategoriPemilihanChange(kategori, preserveLembaga);
}

function applyKategoriPemilihanChange(kategori, preserveLembaga = false) {
  setTimeout(saveSessionDraft, 100);
  const selectLemb = document.getElementById('selectLembaga');
  const trigLemb = document.getElementById('triggerLembaga');
  const currentLembaga = selectLemb ? selectLemb.value : '';

  if (!selectLemb) return;

  if (!kategori) {
    selectLemb.innerHTML = '<option value="">-- Pilih Jenis Pemilihan Terlebih Dahulu --</option>';
    selectLemb.value = '';
    selectLemb.disabled = true;
    if (trigLemb) {
      trigLemb.classList.add('disabled');
      trigLemb.setAttribute('aria-disabled', 'true');
    }
  } else {
    const list = LEMBAGA_OPTIONS_BY_KATEGORI[kategori] || [];
    selectLemb.innerHTML = '<option value="">-- Pilih Jenis Lembaga --</option>';
    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      selectLemb.appendChild(opt);
    });
    selectLemb.disabled = false;
    if (trigLemb) {
      trigLemb.classList.remove('disabled');
      trigLemb.removeAttribute('aria-disabled');
    }

    if (preserveLembaga && list.some(item => item.value === currentLembaga)) {
      selectLemb.value = currentLembaga;
    } else {
      selectLemb.value = '';
    }
  }

  // Jika master data memiliki partisi wilayah khusus Pilkada, perbarui dropdown kecamatan
  if (masterDataCache && masterDataCache.wilayahPilkada && masterDataCache.wilayahPilkada.length > 0) {
    const selectKec = document.getElementById('selectKecamatan');
    const currentKec = selectKec ? selectKec.value : '';
    const activeWilayah = getActiveWilayahList();
    if (selectKec) {
      selectKec.innerHTML = '<option value="">-- Pilih Kecamatan --</option>';
      activeWilayah.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.kecamatan;
        opt.textContent = item.kecamatan;
        selectKec.appendChild(opt);
      });
      if (currentKec && activeWilayah.some(w => w.kecamatan === currentKec)) {
        selectKec.value = currentKec;
      } else {
        selectKec.value = '';
        onKecamatanChanged();
      }
    }
  }

  onLembagaSelectionChanged();
  syncAllPickers();
}

function onLembagaSelectionChanged() {
  updateGeneratedFilename();
  syncPagesStateWithLembaga();
  updateTargetPageUI();
  renderPageSlots();
  syncAllPickers();
}

function updateTargetPageUI() {
  const selectedKategori = document.getElementById('selectKategoriPemilihan')?.value || '';
  const selectedLembaga = document.getElementById('selectLembaga')?.value || '';
  const targetPages = selectedLembaga ? (TARGET_HALAMAN[selectedLembaga] || 3) : 0;
  const filledCount = pagesState.filter(p => p.dataUrl).length;

  const targetInfoText = document.getElementById('targetPageInfoText');
  const targetInfoStatus = document.getElementById('targetPageInfoStatus');
  const slotHint = document.getElementById('slotInstructionHint');

  if (targetInfoText) {
    targetInfoText.textContent = selectedLembaga ? `${targetPages} Halaman` : '-- Halaman';
  }

  if (targetInfoStatus) {
    if (!selectedKategori) {
      targetInfoStatus.textContent = 'Pilih Pemilihan';
      targetInfoStatus.style.color = '#64748b';
      targetInfoStatus.style.background = '#f1f5f9';
    } else if (!selectedLembaga) {
      targetInfoStatus.textContent = 'Pilih Lembaga';
      targetInfoStatus.style.color = '#64748b';
      targetInfoStatus.style.background = '#f1f5f9';
    } else if (filledCount >= targetPages) {
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
    if (selectedLembaga) {
      slotHint.innerHTML = `Ketuk slot foto untuk memotret dokumen. Jumlah slot disesuaikan untuk <strong>${selectedLembaga}</strong>: <strong>${targetPages} Halaman</strong>.`;
    } else if (selectedKategori) {
      slotHint.innerHTML = `Silakan tentukan <strong>Jenis Lembaga</strong> pada kategori <strong>${selectedKategori}</strong> terlebih dahulu.`;
    } else {
      slotHint.innerHTML = `Silakan tentukan <strong>Jenis Pemilihan (Pemilu/Pilkada)</strong> dan <strong>Jenis Lembaga</strong> terlebih dahulu.`;
    }
  }
}

function renderPageSlots() {
  const container = document.getElementById('pageSlotsGrid');
  if (!container) return;
  container.innerHTML = '';

  const selectedKategori = document.getElementById('selectKategoriPemilihan')?.value || '';
  const selectedLembaga = document.getElementById('selectLembaga')?.value || '';
  const targetPages = getTargetPagesForCurrentLembaga();

  if (!selectedKategori || !selectedLembaga || targetPages === 0) {
    container.classList.remove('slots-3');
    pagesState = [];
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'slots-empty-notice';
    emptyNotice.style.gridColumn = '1 / -1';
    emptyNotice.style.textAlign = 'center';
    emptyNotice.style.padding = '28px 16px';
    emptyNotice.style.color = 'var(--text-muted)';
    emptyNotice.style.fontSize = '12.5px';
    emptyNotice.style.background = '#f8fafc';
    emptyNotice.style.border = '1.5px dashed #cbd5e1';
    emptyNotice.style.borderRadius = '10px';
    
    if (!selectedKategori) {
      emptyNotice.innerHTML = `
        <div style="font-size: 26px; margin-bottom: 8px;">🗳️</div>
        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Pilih Jenis Pemilihan Terlebih Dahulu</div>
        <div>Silakan tentukan <strong>Jenis Pemilihan (Pemilu atau Pilkada)</strong> pada formulir di atas untuk menampilkan pilihan lembaga dan slot foto dokumen.</div>
      `;
    } else {
      const isPemilu = selectedKategori === 'PEMILU';
      emptyNotice.innerHTML = `
        <div style="font-size: 26px; margin-bottom: 8px;">🏛️</div>
        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Pilih Jenis Lembaga Terlebih Dahulu</div>
        <div>Silakan tentukan <strong>Jenis Lembaga</strong> (${isPemilu ? '5 Lembaga Pemilu' : '2 Lembaga Pilkada'}) pada formulir di atas untuk menampilkan slot foto dokumen.</div>
      `;
    }
    container.appendChild(emptyNotice);

    const badge = document.getElementById('pageCountBadge');
    if (badge) {
      badge.textContent = 'Belum Dipilih';
      badge.style.backgroundColor = 'var(--text-muted)';
    }

    const btnProcess = document.getElementById('btnProcessUpload');
    const btnProcessLabel = document.getElementById('btnProcessLabel');
    if (btnProcess) {
      btnProcess.disabled = true;
      if (btnProcessLabel) btnProcessLabel.textContent = 'Render & Simpan PDF';
    }

    updateTargetPageUI();
    return;
  }

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
  const selectKategori = document.getElementById('selectKategoriPemilihan');
  const selectJenis = document.getElementById('selectJenisFile');
  const selectLemb = document.getElementById('selectLembaga');
  const selectKec = document.getElementById('selectKecamatan');
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');

  const kategori = selectKategori?.value || '';
  const jenis = selectJenis?.value || '';
  const lembaga = selectLemb?.value || '';
  const kec = selectKec?.value || '';
  const desa = selectDesa?.value || '';
  const tps = selectTPS?.value || '';
  const hasRegionSelected = !!(kec || desa || tps);
  const hasMetaSelected = !!(kategori || jenis || lembaga);

  // Jika tidak ada foto, belum ada wilayah, dan belum ada metadata yang dipilih
  if (filledCount === 0 && !hasRegionSelected && !hasMetaSelected) {
    showAppToast('Formulir dan slot foto sudah dalam keadaan bersih/kosong.', 'info', 2500);
    return;
  }

  const labelParts = [];
  if (kategori) labelParts.push(kategori);
  if (jenis) labelParts.push(jenis);
  if (lembaga) labelParts.push(lembaga);
  if (kec) labelParts.push(kec);
  if (desa) labelParts.push(desa);
  if (tps) labelParts.push(`TPS ${tps}`);
  const formLabel = labelParts.join(' - ');

  // Skenario 1: Ada foto DAN formulir (wilayah/metadata) terpilih
  if (filledCount > 0 && (hasRegionSelected || hasMetaSelected)) {
    showAppDialog({
      title: 'Reset Kamera & Upload?',
      type: 'warning',
      message: `Ditemukan <strong>${filledCount} foto halaman</strong> dan formulir aktif (<strong>${escapeHtml(formLabel)}</strong>).<br><br>Pilih tindakan reset yang diinginkan:`,
      confirmText: 'Ya, Reset Semua (Formulir & Foto)',
      secondaryText: 'Hapus Foto Saja (Formulir Tetap)',
      cancelText: 'Batal',
      onConfirm: () => {
        if (selectKategori) selectKategori.value = '';
        applyKategoriPemilihanChange('');
        if (selectJenis) selectJenis.value = '';
        initPagesState();
        renderPageSlots();
        resetWilayahSelectionToDefault();
        clearSessionDraft();
        showAppToast('Formulir dan slot foto berhasil di-reset.', 'success', 2500);
      },
      onSecondary: () => {
        initPagesState();
        renderPageSlots();
        showAppToast(`Seluruh foto halaman (${filledCount} foto) berhasil dihapus. Pilihan formulir tetap tersimpan.`, 'info', 2500);
      }
    });
    return;
  }

  // Skenario 2: Ada foto, tetapi belum ada formulir terpilih
  if (filledCount > 0) {
    showAppDialog({
      title: 'Hapus Seluruh Foto?',
      type: 'warning',
      message: `Apakah Anda yakin ingin menghapus seluruh <strong>${filledCount} foto halaman</strong> yang sudah diambil?`,
      confirmText: 'Ya, Hapus Semua Foto',
      cancelText: 'Batal',
      onConfirm: () => {
        initPagesState();
        renderPageSlots();
        clearSessionDraft();
        showAppToast('Seluruh foto halaman berhasil di-reset.', 'info', 2500);
      }
    });
    return;
  }

  // Skenario 3: Belum ada foto, tetapi formulir (wilayah/metadata) sudah dipilih
  showAppDialog({
    title: 'Reset Pilihan Formulir?',
    type: 'warning',
    message: `Apakah Anda yakin ingin mereset pilihan formulir (<strong>${escapeHtml(formLabel)}</strong>) kembali ke awal?`,
    confirmText: 'Ya, Reset Formulir',
    cancelText: 'Batal',
    onConfirm: () => {
      if (selectKategori) selectKategori.value = '';
      applyKategoriPemilihanChange('');
      if (selectJenis) selectJenis.value = '';
      initPagesState();
      renderPageSlots();
      resetWilayahSelectionToDefault();
      showAppToast('Pilihan formulir berhasil di-reset.', 'info', 2500);
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
  const kategori = document.getElementById('selectKategoriPemilihan')?.value || '';
  const jenis = document.getElementById('selectJenisFile')?.value || '';
  const lembaga = document.getElementById('selectLembaga')?.value || '';
  const kec = document.getElementById('selectKecamatan')?.value || '';
  const desa = document.getElementById('selectDesa')?.value || '';
  const tps = document.getElementById('selectTPS')?.value || '';

  if (!kategori) {
    showAppDialog({
      title: 'Pilih Jenis Pemilihan Terlebih Dahulu',
      type: 'warning',
      message: 'Silakan tentukan pilihan <strong>Jenis Pemilihan (Pemilu atau Pilkada)</strong> pada formulir di atas sebelum mengambil foto dokumen.',
      confirmText: 'Pilih Sekarang',
      onConfirm: () => {
        const trig = document.getElementById('triggerKategoriPemilihan');
        if (trig) trig.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

  if (!jenis || !lembaga) {
    showAppDialog({
      title: 'Pilih Metadata Terlebih Dahulu',
      type: 'warning',
      message: 'Silakan tentukan pilihan <strong>Jenis Berkas Dokumen</strong> dan <strong>Jenis Lembaga</strong> pada formulir di atas sebelum mengambil foto dokumen.',
      confirmText: 'Pilih Sekarang',
      onConfirm: () => {
        const trig = !jenis ? document.getElementById('triggerJenisFile') : document.getElementById('triggerLembaga');
        if (trig) trig.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

  if (!kec || !desa || !tps) {
    showAppDialog({
      title: 'Pilih Wilayah Terlebih Dahulu',
      type: 'warning',
      message: 'Silakan tentukan pilihan <strong>Kecamatan, Desa, dan Nomor TPS</strong> pada formulir di atas sebelum mengambil foto dokumen.',
      confirmText: 'Pilih Wilayah',
      onConfirm: () => {
        const trigKec = document.getElementById('triggerKecamatan');
        if (trigKec) trigKec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

  activeSlotIndex = index;
  const modal = document.getElementById('cameraModal');
  const metaEl = document.getElementById('cameraDocMeta');
  const title = document.getElementById('cameraSlotTitle');

  const targetPages = TARGET_HALAMAN[lembaga] || 3;

  const cleanJenis = sanitizeStr(jenis);
  const cleanLembaga = sanitizeStr(lembaga);
  const cleanKec = sanitizeStr(kec);
  const cleanDesa = sanitizeStr(desa);
  const cleanTps = formatTpsNum(tps);

  const docMetaStr = `${cleanJenis}_${cleanLembaga}_${cleanKec}_${cleanDesa}_${cleanTps}`;

  if (metaEl) {
    metaEl.textContent = docMetaStr;

    // Skala dinamis awal berbasis panjang karakter
    const len = docMetaStr.length;
    let baseSize = 8.5;
    let baseSpacing = '-0.3px';

    if (len > 44) {
      baseSize = 7.0;
      baseSpacing = '-0.45px';
    } else if (len > 36) {
      baseSize = 7.8;
      baseSpacing = '-0.35px';
    } else if (len > 28) {
      baseSize = 8.6;
      baseSpacing = '-0.25px';
    } else {
      baseSize = 9.8;
      baseSpacing = 'normal';
    }

    metaEl.style.fontSize = baseSize + 'px';
    metaEl.style.letterSpacing = baseSpacing;
  }

  if (title) {
    title.textContent = `Halaman ${index + 1} / ${targetPages}`;
  }

  modal.classList.add('active');

  // Dynamic auto-fit check saat modal aktif (DOM rendered):
  // Menjamin 100% seluruh teks termasuk nomor TPS selalu utuh terlihat tanpa terpotong ellipsis
  requestAnimationFrame(() => {
    if (metaEl && metaEl.clientWidth > 0) {
      let currentSize = parseFloat(window.getComputedStyle(metaEl).fontSize) || 8.0;
      while (metaEl.scrollWidth > metaEl.clientWidth && currentSize > 5.5) {
        currentSize -= 0.3;
        metaEl.style.fontSize = currentSize + 'px';
      }
    }
  });

  startCameraStream();
}

function closeCameraModal() {
  stopCameraStream();
  const modal = document.getElementById('cameraModal');
  if (modal) modal.classList.remove('active');
}

let isFlashOn = false;
let isScreenFlashActive = false;
let availableVideoDevices = [];
let rearCameraDevices = [];
let currentRearCameraIndex = 0;
let cameraTrack = null;
let currentZoomLevel = 1.0;
let focusListenerAttached = false;

async function startCameraStream() {
  stopCameraStream();
  const video = document.getElementById('cameraVideo');
  if (!video) return;

  // 1. Dapatkan daftar device kamera fisik
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      availableVideoDevices = allDevices.filter(d => d.kind === 'videoinput');
      
      rearCameraDevices = availableVideoDevices.filter(d => {
        const lbl = (d.label || '').toLowerCase();
        return lbl.includes('back') || lbl.includes('rear') || lbl.includes('belakang') || lbl.includes('environment');
      });

      // Urutkan agar kamera utama (Main 1x / Standard) berada di urutan teratas, hindari ultra-wide (0.5x / wide-angle / macro)
      rearCameraDevices.sort((a, b) => {
        const aLbl = (a.label || '').toLowerCase();
        const bLbl = (b.label || '').toLowerCase();
        const aIsWide = aLbl.includes('wide') || aLbl.includes('0.5') || aLbl.includes('0.6') || aLbl.includes('ultra');
        const bIsWide = bLbl.includes('wide') || bLbl.includes('0.5') || bLbl.includes('0.6') || bLbl.includes('ultra');
        if (aIsWide && !bIsWide) return 1;
        if (!aIsWide && bIsWide) return -1;
        return 0;
      });
    }
  } catch (eEnum) {
    console.warn('enumerateDevices notice:', eEnum);
  }

  const targetDeviceId = (currentFacingMode === 'environment' && rearCameraDevices.length > 0)
    ? rearCameraDevices[currentRearCameraIndex % rearCameraDevices.length].deviceId
    : undefined;

  // Prioritaskan resolusi sensor tinggi (Full HD / 4K) dan autofocus kontinu
  const constraints = {
    audio: false,
    video: {
      deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
      facingMode: targetDeviceId ? undefined : { ideal: currentFacingMode },
      width: { ideal: 3840, min: 1920 },
      height: { ideal: 2160, min: 1080 },
      focusMode: { ideal: 'continuous' }
    }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraStream = stream;
    cameraTrack = stream.getVideoTracks()[0];
    video.srcObject = stream;
    await video.play();

    isFlashOn = false;
    isScreenFlashActive = false;
    updateFlashUI(false);

    setupCameraCapabilities(cameraTrack);
    attachVideoFocusListener(video);
  } catch (err) {
    console.warn('getUserMedia high-res gagal, mencoba constraint standar:', err);
    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      cameraStream = fallbackStream;
      cameraTrack = fallbackStream.getVideoTracks()[0];
      video.srcObject = fallbackStream;
      await video.play();

      isFlashOn = false;
      isScreenFlashActive = false;
      updateFlashUI(false);

      setupCameraCapabilities(cameraTrack);
      attachVideoFocusListener(video);
    } catch (errFallback) {
      console.warn('getUserMedia fallback gagal, beralih ke kamera native:', errFallback);
      triggerNativeCamera();
    }
  }
}

function setupCameraCapabilities(track) {
  if (!track) return;
  const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  const zoomContainer = document.getElementById('cameraZoomControls');
  const qualityPill = document.getElementById('cameraQualityPill');

  // 1. Tangani Kontrol Zoom & Cegah Kamera Terkunci di 0.5x Ultra-Wide
  if (capabilities.zoom) {
    const minZoom = capabilities.zoom.min || 1.0;
    const maxZoom = capabilities.zoom.max || 1.0;

    // Jika kamera secara default berada di mode ultra-wide (< 1.0), otomatis paksa zoom ke 1.0x (Kamera Utama Standard)
    if (minZoom < 1.0) {
      setCameraZoom(1.0);
    }

    if (zoomContainer) {
      zoomContainer.style.display = 'flex';
      const btnWide = document.getElementById('btnZoomWide');
      const btn1x = document.getElementById('btnZoom1x');
      const btn2x = document.getElementById('btnZoom2x');

      if (btnWide) btnWide.style.display = minZoom < 1.0 ? 'inline-block' : 'none';
      if (btn1x) btn1x.style.display = (minZoom <= 1.0 && maxZoom >= 1.0) ? 'inline-block' : 'none';
      if (btn2x) btn2x.style.display = maxZoom >= 1.8 ? 'inline-block' : 'none';
      updateZoomUI(1.0);
    }
    if (qualityPill) {
      qualityPill.textContent = '✨ Kamera Utama 1x (Mode Jernih HD)';
    }
  } else {
    if (zoomContainer) zoomContainer.style.display = 'none';
    if (qualityPill) {
      qualityPill.textContent = '✨ Kamera Aktif (Resolusi Tinggi)';
    }
  }

  // 2. Tombol Ganti Lensa Belakang jika terdeteksi lebih dari 1 kamera belakang fisik
  const btnSwitchLens = document.getElementById('btnSwitchRearLens');
  const lensLabel = document.getElementById('lensLabel');
  if (btnSwitchLens) {
    if (currentFacingMode === 'environment' && rearCameraDevices.length > 1) {
      btnSwitchLens.style.display = 'flex';
      if (lensLabel) {
        lensLabel.textContent = `Lensa ${currentRearCameraIndex + 1}`;
      }
    } else {
      btnSwitchLens.style.display = 'none';
    }
  }

  // 3. Pasang Autofocus kontinu
  if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
    track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  }
}

async function setCameraZoom(zoomVal) {
  if (!cameraTrack) return;
  const capabilities = typeof cameraTrack.getCapabilities === 'function' ? cameraTrack.getCapabilities() : {};
  if (!capabilities.zoom) return;

  const minZ = capabilities.zoom.min || 1.0;
  const maxZ = capabilities.zoom.max || 1.0;
  const targetZ = Math.min(maxZ, Math.max(minZ, zoomVal));

  try {
    await cameraTrack.applyConstraints({
      advanced: [{ zoom: targetZ }]
    });
    currentZoomLevel = targetZ;
    updateZoomUI(targetZ);
  } catch (errZ) {
    console.warn('applyConstraints zoom gagal:', errZ);
  }
}

function updateZoomUI(currentZ) {
  const pills = document.querySelectorAll('.zoom-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (currentZ < 0.9) {
    document.getElementById('btnZoomWide')?.classList.add('active');
  } else if (currentZ >= 1.8) {
    document.getElementById('btnZoom2x')?.classList.add('active');
  } else {
    document.getElementById('btnZoom1x')?.classList.add('active');
  }
}

async function switchRearCameraLens() {
  if (rearCameraDevices.length <= 1) return;
  currentRearCameraIndex = (currentRearCameraIndex + 1) % rearCameraDevices.length;
  const selectedDev = rearCameraDevices[currentRearCameraIndex];
  const devName = selectedDev.label || `Lensa ${currentRearCameraIndex + 1}`;
  showAppToast(`Beralih ke: ${devName}`, 'info', 1800);
  startCameraStream();
}

function attachVideoFocusListener(video) {
  if (!video || focusListenerAttached) return;
  focusListenerAttached = true;

  video.addEventListener('click', (event) => {
    if (!cameraTrack) return;
    const rect = video.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    showFocusRing(x, y);

    const capabilities = typeof cameraTrack.getCapabilities === 'function' ? cameraTrack.getCapabilities() : {};
    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
      const normX = Math.max(0, Math.min(1, x / rect.width));
      const normY = Math.max(0, Math.min(1, y / rect.height));
      cameraTrack.applyConstraints({
        advanced: [{ focusMode: 'continuous', pointsOfInterest: [{ x: normX, y: normY }] }]
      }).catch(() => {});
    }
  });
}

function showFocusRing(x, y) {
  const ring = document.getElementById('cameraFocusRing');
  if (!ring) return;
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  ring.classList.add('active');
  setTimeout(() => {
    ring.classList.remove('active');
  }, 900);
}

function stopCameraStream() {
  if (cameraStream) {
    if (isFlashOn) {
      const track = cameraStream.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
    }
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraTrack = null;
  }
  isFlashOn = false;
  isScreenFlashActive = false;
  const overlay = document.getElementById('screenFlashOverlay');
  if (overlay) overlay.classList.remove('active');
  updateFlashUI(false);
}

async function toggleFlashTorch() {
  if (!cameraStream) {
    showAppToast('Kamera belum aktif.', 'warning');
    return;
  }

  const track = cameraStream.getVideoTracks()[0];
  if (!track) {
    showAppToast('Kamera tidak terdeteksi.', 'warning');
    return;
  }

  const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};

  // 1. Coba aktifkan Hardware Flash / Torch kamera fisik
  if (capabilities && capabilities.torch) {
    try {
      isFlashOn = !isFlashOn;
      await track.applyConstraints({
        advanced: [{ torch: isFlashOn }]
      });
      updateFlashUI(isFlashOn);
      showAppToast(isFlashOn ? '⚡ Lampu Flash / Blitz Menyala' : '⚡ Lampu Flash Dimatikan', 'info');
      return;
    } catch (err) {
      console.warn('Gagal mengaktifkan hardware torch, mencoba mode layar terang:', err);
    }
  }

  // 2. Fallback: Jika hardware torch tidak didukung browser/kamera, gunakan Penerang Layar (Screen Flash Glow)
  toggleScreenFlashFallback();
}

function updateFlashUI(active) {
  const btns = [document.getElementById('btnToggleFlash')];
  const icons = [document.getElementById('flashIcon')];

  btns.forEach(btn => {
    if (!btn) return;
    if (active) {
      btn.classList.add('flash-active');
      btn.setAttribute('title', 'Matikan Flash / Blitz');
    } else {
      btn.classList.remove('flash-active');
      btn.setAttribute('title', 'Nyalakan Flash / Blitz');
    }
  });

  icons.forEach(icon => {
    if (!icon) return;
    if (active) {
      icon.innerHTML = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#713F12" stroke="#713F12"></path>';
    } else {
      icon.innerHTML = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor"></path>';
    }
  });
}

function toggleScreenFlashFallback() {
  isScreenFlashActive = !isScreenFlashActive;
  const overlay = document.getElementById('screenFlashOverlay');
  if (overlay) {
    if (isScreenFlashActive) {
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }
  updateFlashUI(isScreenFlashActive);
  showAppToast(isScreenFlashActive ? '💡 Penerang Layar Aktif (Flash Alternatif)' : '💡 Penerang Layar Dimatikan', 'info');
}

function toggleCameraFacing() {
  stopCameraStream();
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  startCameraStream();
}

function triggerNativeCamera() {
  const input = document.getElementById('nativeCameraInput') || document.getElementById('fallbackFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function triggerGalleryFile() {
  const input = document.getElementById('galleryFileInput') || document.getElementById('fallbackFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function triggerFallbackFile() {
  triggerNativeCamera();
}

function handleFallbackFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  showLoading('Memuat Pratinjau...', 'Mempersiapkan pratinjau & pelurus dokumen...');
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      hideLoading();
      closeCameraModal();
      openCropDeskewModal(img, activeSlotIndex);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Hitung koordinat ternormalisasi [0..1] dari patokan bingkai (.camera-guide-overlay)
 * relatif terhadap video stream aktif (#cameraVideo dengan object-fit: cover)
 */
function getCameraGuideCropNormalized(video) {
  const guideEl = document.querySelector('#cameraModal .camera-guide-overlay');
  if (!video || !guideEl || !video.videoWidth || !video.videoHeight) return null;

  const vRect = video.getBoundingClientRect();
  const gRect = guideEl.getBoundingClientRect();
  if (!vRect.width || !vRect.height || !gRect.width || !gRect.height) return null;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const rw = vRect.width;
  const rh = vRect.height;

  // Karena #cameraVideo menggunakan object-fit: cover
  const coverScale = Math.max(rw / vw, rh / vh);
  const renderedW = vw * coverScale;
  const renderedH = vh * coverScale;
  const offsetX = (renderedW - rw) / 2;
  const offsetY = (renderedH - rh) / 2;

  const gLeft = gRect.left - vRect.left;
  const gTop = gRect.top - vRect.top;

  const u0 = Math.max(0, Math.min(1, (gLeft + offsetX) / renderedW));
  const v0 = Math.max(0, Math.min(1, (gTop + offsetY) / renderedH));
  const u1 = Math.max(0, Math.min(1, (gLeft + gRect.width + offsetX) / renderedW));
  const v1 = Math.max(0, Math.min(1, (gTop + gRect.height + offsetY) / renderedH));

  return {
    u0,
    v0,
    u1,
    v1,
    videoAspect: vw / vh
  };
}

/**
 * Potong tangkapan foto mentah agar 100% sesuai dengan area di dalam Patokan Bingkai (.camera-guide-overlay)
 * Membuang area di luar bingkai (plafon di balik header atau lantai di balik tombol shutter)
 */
function cropImageToGuideNormalized(img, guideNorm) {
  if (!guideNorm) return img;
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return img;

  const imgAspect = imgW / imgH;
  const vidAspect = guideNorm.videoAspect || imgAspect;

  let activeW = imgW;
  let activeH = imgH;
  let offX = 0;
  let offY = 0;

  // Jika ImageCapture mengembalikan rasio sensor 3:4 sedangkan video preview 9:16, sesuaikan center-crop sensor
  if (Math.abs(imgAspect - vidAspect) > 0.02) {
    if (imgAspect > vidAspect) {
      activeW = imgH * vidAspect;
      offX = (imgW - activeW) / 2;
    } else {
      activeH = imgW / vidAspect;
      offY = (imgH - activeH) / 2;
    }
  }

  const sx = Math.max(0, Math.round(offX + guideNorm.u0 * activeW));
  const sy = Math.max(0, Math.round(offY + guideNorm.v0 * activeH));
  const sw = Math.min(imgW - sx, Math.round((guideNorm.u1 - guideNorm.u0) * activeW));
  const sh = Math.min(imgH - sy, Math.round((guideNorm.v1 - guideNorm.v0) * activeH));

  if (sw < 120 || sh < 120) return img;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = sw;
  croppedCanvas.height = sh;
  const ctx = croppedCanvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return croppedCanvas;
}

async function capturePhotoFromVideo() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth) {
    triggerNativeCamera();
    return;
  }

  // Rekam koordinat patokan bingkai (.camera-guide-overlay) SEBELUM modal kamera ditutup
  const guideNorm = getCameraGuideCropNormalized(video);

  showLoading('Mengambil Foto...', 'Memproses tangkapan sesuai patokan bingkai...');

  const track = cameraStream ? cameraStream.getVideoTracks()[0] : null;

  // 1. Upayakan tangkapan sensor perangkat keras resolusi penuh via ImageCapture API
  if (window.ImageCapture && track && track.readyState === 'live') {
    try {
      const imageCap = new ImageCapture(track);
      const photoBlob = await imageCap.takePhoto({
        fillLightMode: isFlashOn ? 'flash' : 'off'
      });

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const guideCropped = cropImageToGuideNormalized(img, guideNorm);
          hideLoading();
          closeCameraModal();
          openCropDeskewModal(guideCropped, activeSlotIndex);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(photoBlob);
      return;
    } catch (errIC) {
      console.warn('ImageCapture takePhoto fallback ke video canvas:', errIC);
    }
  }

  // 2. Fallback tangkapan canvas resolusi penuh dari video stream (dipotong tepat sesuai patokan bingkai)
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = video.videoWidth;
  offscreenCanvas.height = video.videoHeight;
  const ctx = offscreenCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const guideCropped = cropImageToGuideNormalized(offscreenCanvas, guideNorm);
  hideLoading();
  closeCameraModal();
  openCropDeskewModal(guideCropped, activeSlotIndex);
}

/**
 * ==============================================================================
 * DRAFT SESSION PERSISTENCE ENGINE (ANTI-RESTART RESILIENCE)
 * Menjaga progres kerja operator (pilihan wilayah & hingga 20 foto halaman)
 * tersimpan secara offline via IndexedDB.
 * Jika operator menekan tombol Home, keluar aplikasi, atau browser me-reload,
 * sesi langsung otomatis dipulihkan kembali saat aplikasi dibuka.
 * ==============================================================================
 */

const SESSION_DB_NAME = 'simambil_session_db';
const SESSION_STORE_NAME = 'session_draft';
const SESSION_DB_VERSION = 1;

function getSessionDb() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const req = window.indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });
}

async function saveSessionDraft() {
  try {
    const db = await getSessionDb();
    if (!db) return;

    const selectKategori = document.getElementById('selectKategoriPemilihan');
    const selectJenis = document.getElementById('selectJenisFile');
    const selectLembaga = document.getElementById('selectLembaga');
    const selectKec = document.getElementById('selectKecamatan');
    const selectDesa = document.getElementById('selectDesa');
    const selectTPS = document.getElementById('selectTPS');

    const isRekapActive = document.getElementById('rekapPanel')?.classList.contains('active');
    const activeTab = isRekapActive ? 'rekap' : 'camera';

    const draft = {
      savedAt: Date.now(),
      activeTab: activeTab,
      kategori: selectKategori ? selectKategori.value : '',
      jenisFile: selectJenis ? selectJenis.value : '',
      lembaga: selectLembaga ? selectLembaga.value : '',
      kecamatan: selectKec ? selectKec.value : '',
      desa: selectDesa ? selectDesa.value : '',
      tps: selectTPS ? selectTPS.value : '',
      pagesState: (pagesState || []).map(p => ({
        page: p.page,
        dataUrl: p.dataUrl,
        rotation: p.rotation || 0
      }))
    };

    const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
    tx.objectStore(SESSION_STORE_NAME).put(draft, 'active_session');

    const filledCount = draft.pagesState.filter(p => p.dataUrl).length;
    localStorage.setItem('SIMAMBIL_DRAFT_HAS_PHOTOS', filledCount > 0 ? '1' : '0');
  } catch (err) {
    console.warn('Gagal menyimpan draft sesi:', err);
  }
}

async function getSavedSessionDraft() {
  try {
    const db = await getSessionDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(SESSION_STORE_NAME, 'readonly');
      const req = tx.objectStore(SESSION_STORE_NAME).get('active_session');
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

async function clearSessionDraft() {
  try {
    const db = await getSessionDb();
    if (db) {
      const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
      tx.objectStore(SESSION_STORE_NAME).delete('active_session');
    }
    localStorage.removeItem('SIMAMBIL_DRAFT_HAS_PHOTOS');
  } catch (err) {
    console.warn('Gagal menghapus draft sesi:', err);
  }
}

async function restoreSessionDraftIfAvailable() {
  try {
    const draft = await getSavedSessionDraft();
    if (!draft) return false;

    // Kadaluwarsa setelah 7 hari
    if (draft.savedAt && (Date.now() - draft.savedAt > 7 * 24 * 3600 * 1000)) {
      clearSessionDraft();
      return false;
    }

    const hasPhotos = Array.isArray(draft.pagesState) && draft.pagesState.some(p => p.dataUrl);
    const hasForm = !!(draft.kategori || draft.lembaga || draft.kecamatan);

    if (!hasPhotos && !hasForm) return false;

    // 1. Pulihkan Jenis Pemilihan
    if (draft.kategori) {
      const elKat = document.getElementById('selectKategoriPemilihan');
      if (elKat) {
        elKat.value = draft.kategori;
        applyKategoriPemilihanChange(draft.kategori, true);
      }
    }

    // 2. Pulihkan Jenis File & Lembaga
    if (draft.jenisFile) {
      const elJenis = document.getElementById('selectJenisFile');
      if (elJenis) elJenis.value = draft.jenisFile;
    }

    if (draft.lembaga) {
      const elLemb = document.getElementById('selectLembaga');
      if (elLemb) {
        elLemb.value = draft.lembaga;
        updateTargetPageUI();
      }
    }

    // 3. Pulihkan Wilayah (Kecamatan, Desa, TPS)
    if (draft.kecamatan) {
      const elKec = document.getElementById('selectKecamatan');
      if (elKec) {
        elKec.value = draft.kecamatan;
        onKecamatanChanged();
      }
      if (draft.desa) {
        const elDesa = document.getElementById('selectDesa');
        if (elDesa) {
          elDesa.value = draft.desa;
          onDesaChanged();
        }
        if (draft.tps) {
          const elTps = document.getElementById('selectTPS');
          if (elTps) {
            elTps.value = draft.tps;
          }
        }
      }
    }

    // 4. Pulihkan Foto Halaman (pagesState)
    if (hasPhotos) {
      pagesState = draft.pagesState;
      renderPageSlots();
      const filledCount = pagesState.filter(p => p.dataUrl).length;
      showAppToast(`Sesi kerja dipulihkan (${filledCount} foto siap dilanjutkan).`, 'info', 3200);
    }

    // 5. Pulihkan Tab Terakhir
    if (draft.activeTab) {
      switchTab(draft.activeTab);
    }

    syncAllPickers();
    updateGeneratedFilename();
    return true;
  } catch (errRestore) {
    console.warn('Gagal memulihkan draft sesi:', errRestore);
    return false;
  }
}


/**
 * ==============================================================================
 * 4B. PRATINJAU DOKUMEN & PELURUS PERSPEKTIF CAMSCANNER PRO (AUTO-DESKEW & HD CLARIFIER)
 * Fitur:
 * 1. Pemotongan otomatis mengikuti Patokan Bingkai kamera (.camera-guide-overlay)
 * 2. Auto-Deteksi 4 Titik Sudut & Trapesium Kertas C-Plano (Inside-Out White-Ratio + Table Trapezoid)
 * 3. Bilinear Sub-Pixel Quad Warp + 8-Band Horizontal Line Dewarping (100% Tegak Lurus 0.0°)
 * 4. CamScanner HD Document Clarifier (5x5 Morphological Shadow Removal + 3x3 Unsharp Mask USM)
 * ==============================================================================
 */

let cropDeskewState = {
  rawImage: null,          // HTMLImageElement atau HTMLCanvasElement (sudah terpotong sesuai patokan bingkai)
  slotIndex: 0,
  corners: [],             // [ {x, y}, {x, y}, {x, y}, {x, y} ] dalam koordinat rawImage
  activeCornerIndex: -1,   // 0: TL, 1: TR, 2: BR, 3: BL
  displayScale: 1,         // rasio koordinat canvas display / piksel asli
  dpr: 1,                  // device pixel ratio untuk rendering retina/AMOLED tajam
  isDragging: false,
  dragMode: null,          // 'corner' | 'pan'
  panStart: null,
  initialCorners: null,
  listenersAttached: false
};

/**
 * Deteksi Otomatis 4 Sudut Kertas & Trapesium Tabel C-Plano (Smart CamScanner Auto-Quad)
 * Berjalan pada resolusi analisis cepat (~360x500) dalam ~12ms
 */
function autoDetectCPlanoCornersFromElement(imgElement) {
  const origW = imgElement.naturalWidth || imgElement.width;
  const origH = imgElement.naturalHeight || imgElement.height;
  if (!origW || !origH) return null;

  const maxAn = 460;
  const scale = Math.min(1.0, maxAn / Math.max(origW, origH));
  const imgW = Math.max(120, Math.round(origW * scale));
  const imgH = Math.max(120, Math.round(origH * scale));

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = imgW;
  tmpCanvas.height = imgH;
  const tctx = tmpCanvas.getContext('2d');
  tctx.drawImage(imgElement, 0, 0, imgW, imgH);
  const rgba = tctx.getImageData(0, 0, imgW, imgH).data;

  const lum = new Float32Array(imgW * imgH);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }

  let sumP = 0, cntP = 0;
  for (let y = Math.floor(imgH * 0.25); y < Math.floor(imgH * 0.75); y += 2) {
    for (let x = Math.floor(imgW * 0.25); x < Math.floor(imgW * 0.75); x += 2) {
      if (lum[y * imgW + x] > 115) { sumP += lum[y * imgW + x]; cntP++; }
    }
  }
  const paperLum = cntP > 0 ? (sumP / cntP) : 185;
  const whitePixThresh = paperLum * 0.74;

  function rowWhiteRatio(y, x0Frac, x1Frac) {
    const x0 = Math.floor(imgW * x0Frac), x1 = Math.floor(imgW * x1Frac);
    let whiteCnt = 0, total = 0;
    const rowOff = y * imgW;
    for (let x = x0; x < x1; x += 2) {
      if (lum[rowOff + x] >= whitePixThresh) whiteCnt++;
      total++;
    }
    return whiteCnt / Math.max(1, total);
  }

  function colWhiteRatio(x, y0Frac, y1Frac) {
    const y0 = Math.floor(imgH * y0Frac), y1 = Math.floor(imgH * y1Frac);
    let whiteCnt = 0, total = 0;
    for (let y = y0; y < y1; y += 2) {
      if (lum[y * imgW + x] >= whitePixThresh) whiteCnt++;
      total++;
    }
    return whiteCnt / Math.max(1, total);
  }

  function scanTopY(x0Frac, x1Frac) {
    let streak = 0;
    for (let y = Math.floor(imgH * 0.30); y >= 2; y--) {
      if (rowWhiteRatio(y, x0Frac, x1Frac) < 0.30) {
        streak++;
        if (streak >= 3) return y + streak + Math.round(imgH * 0.005);
      } else streak = 0;
    }
    return Math.round(imgH * 0.008);
  }

  function scanBotY(x0Frac, x1Frac) {
    let streak = 0;
    for (let y = Math.floor(imgH * 0.70); y < imgH - 2; y++) {
      if (rowWhiteRatio(y, x0Frac, x1Frac) < 0.30) {
        streak++;
        if (streak >= 3) return y - streak - Math.round(imgH * 0.005);
      } else streak = 0;
    }
    return Math.round(imgH * 0.992);
  }

  const topYL = scanTopY(0.22, 0.46);
  const topYR = scanTopY(0.54, 0.78);
  const botYL = scanBotY(0.22, 0.46);
  const botYR = scanBotY(0.54, 0.78);

  const docTop = Math.max(topYL, topYR);
  const docBot = Math.min(botYL, botYR);
  const docH = Math.max(80, docBot - docTop);

  function scanLeftPaperX(y0, y1) {
    const y0F = y0 / imgH, y1F = y1 / imgH;
    let streak = 0;
    for (let x = Math.floor(imgW * 0.25); x >= 2; x--) {
      if (colWhiteRatio(x, y0F, y1F) < 0.30) {
        streak++;
        if (streak >= 3) return x + streak;
      } else streak = 0;
    }
    return Math.round(imgW * 0.008);
  }

  function scanRightPaperX(y0, y1) {
    const y0F = y0 / imgH, y1F = y1 / imgH;
    let streak = 0;
    for (let x = Math.floor(imgW * 0.75); x < imgW - 2; x++) {
      if (colWhiteRatio(x, y0F, y1F) < 0.30) {
        streak++;
        if (streak >= 3) return x - streak;
      } else streak = 0;
    }
    return Math.round(imgW * 0.992);
  }

  const paperLeftT = scanLeftPaperX(docTop + docH * 0.08, docTop + docH * 0.38);
  const paperLeftB = scanLeftPaperX(docTop + docH * 0.62, docTop + docH * 0.92);
  const paperRightT = scanRightPaperX(docTop + docH * 0.08, docTop + docH * 0.38);
  const paperRightB = scanRightPaperX(docTop + docH * 0.62, docTop + docH * 0.92);

  // Deteksi trapesium batas kiri & kanan tabel antara bagian atas (38%..52%) dan bagian bawah (72%..88%)
  function findTableBandLeftRight(y0, y1, pLeft, pRight) {
    const xStart = Math.max(4, pLeft), xEnd = Math.min(imgW - 5, pRight);
    const colEnergy = new Float32Array(imgW);
    for (let y = Math.floor(y0); y < Math.floor(y1); y++) {
      const rowOff = y * imgW;
      for (let x = xStart; x < xEnd; x++) {
        const center = lum[rowOff + x];
        const leftBg = lum[rowOff + Math.max(0, x - 3)];
        const rightBg = lum[rowOff + Math.min(imgW - 1, x + 3)];
        const lineDarkness = Math.max(leftBg, rightBg) - center;
        if (lineDarkness > 20 && Math.min(leftBg, rightBg) > paperLum * 0.68) {
          colEnergy[x] += lineDarkness;
        }
      }
    }
    const smooth = new Float32Array(imgW);
    let maxE = 0;
    for (let x = xStart + 2; x < xEnd - 2; x++) {
      smooth[x] = colEnergy[x - 1] * 0.25 + colEnergy[x] * 0.5 + colEnergy[x + 1] * 0.25;
      if (smooth[x] > maxE) maxE = smooth[x];
    }
    let leftX = -1, rightX = -1;
    const thresh = maxE * 0.26;
    const maxLeftSearch = xStart + Math.floor((xEnd - xStart) * 0.28);
    const minRightSearch = xEnd - Math.floor((xEnd - xStart) * 0.28);
    for (let x = xStart + 2; x < maxLeftSearch; x++) {
      if (smooth[x] >= thresh && smooth[x] >= smooth[x - 1] && smooth[x] >= smooth[x + 1]) { leftX = x; break; }
    }
    for (let x = xEnd - 3; x > minRightSearch; x--) {
      if (smooth[x] >= thresh && smooth[x] >= smooth[x - 1] && smooth[x] >= smooth[x + 1]) { rightX = x; break; }
    }
    return { leftX, rightX, midY: (y0 + y1) * 0.5 };
  }

  const upperBand = findTableBandLeftRight(docTop + docH * 0.38, docTop + docH * 0.52, paperLeftT, paperRightT);
  const lowerBand = findTableBandLeftRight(docTop + docH * 0.72, docTop + docH * 0.88, paperLeftB, paperRightB);

  let topLeftX = paperLeftT, topRightX = paperRightT;
  let botLeftX = paperLeftB, botRightX = paperRightB;

  if (upperBand.leftX > 0 && lowerBand.leftX > 0 && upperBand.rightX > 0 && lowerBand.rightX > 0) {
    const dyBands = Math.max(1, lowerBand.midY - upperBand.midY);
    const dLeftPerY = (lowerBand.leftX - upperBand.leftX) / dyBands;
    const dRightPerY = (lowerBand.rightX - upperBand.rightX) / dyBands;

    const upperTableW = upperBand.rightX - upperBand.leftX;
    const lowerTableW = lowerBand.rightX - lowerBand.leftX;
    const marginTop = upperTableW * 0.042;
    const marginBot = lowerTableW * 0.042;

    const extrapLeftTop = upperBand.leftX + (docTop - upperBand.midY) * dLeftPerY - marginTop;
    const extrapRightTop = upperBand.rightX + (docTop - upperBand.midY) * dRightPerY + marginTop;
    const extrapLeftBot = lowerBand.leftX + (docBot - lowerBand.midY) * dLeftPerY - marginBot;
    const extrapRightBot = lowerBand.rightX + (docBot - lowerBand.midY) * dRightPerY + marginBot;

    topLeftX = Math.max(paperLeftT, extrapLeftTop);
    topRightX = Math.min(paperRightT, extrapRightTop);
    botLeftX = Math.max(paperLeftB, extrapLeftBot);
    botRightX = Math.min(paperRightB, extrapRightBot);
  }

  // Hitung kemiringan horizontal garis tabel atas dan bawah
  const gy = new Float32Array(imgW * imgH);
  for (let y = 1; y < imgH - 1; y++) {
    for (let x = 1; x < imgW - 1; x++) {
      gy[y * imgW + x] = Math.abs(lum[(y + 1) * imgW + x] - lum[(y - 1) * imgW + x]);
    }
  }

  function measureStripSlope(yStart, yEnd) {
    const numStrips = 8;
    const xMin = Math.floor(imgW * 0.15), xMax = Math.floor(imgW * 0.85);
    const stripW = Math.floor((xMax - xMin) / numStrips);
    const strips = [], stripX = [];
    for (let s = 0; s < numStrips; s++) {
      const sx0 = xMin + s * stripW, sx1 = sx0 + stripW;
      stripX.push((sx0 + sx1) * 0.5);
      const prof = new Float32Array(imgH);
      for (let y = yStart; y < yEnd; y++) {
        let sum = 0;
        const rowOff = y * imgW;
        for (let x = sx0; x < sx1; x++) sum += gy[rowOff + x];
        prof[y] = sum;
      }
      const hp = new Float32Array(imgH);
      for (let y = yStart + 2; y < yEnd - 2; y++) {
        const mean = (prof[y - 2] + prof[y - 1] + prof[y] + prof[y + 1] + prof[y + 2]) * 0.2;
        hp[y] = Math.max(0, prof[y] - mean);
      }
      strips.push(hp);
    }
    let bestSlope = 0, maxCorr = -1;
    for (let a = -6.0; a <= 6.0; a += 0.12) {
      const slope = Math.tan((a * Math.PI) / 180);
      let corr = 0;
      for (let s1 = 0; s1 < numStrips - 2; s1++) {
        for (let s2 = s1 + 2; s2 < numStrips; s2++) {
          const dyShift = (stripX[s2] - stripX[s1]) * slope;
          const dy0 = Math.floor(dyShift), frac = dyShift - dy0;
          const p1 = strips[s1], p2 = strips[s2];
          for (let y = yStart + 8; y < yEnd - 8; y++) {
            const y2 = y + dy0;
            if (y2 >= yStart + 2 && y2 < yEnd - 3) {
              corr += p1[y] * (p2[y2] * (1 - frac) + p2[y2 + 1] * frac);
            }
          }
        }
      }
      if (corr > maxCorr) { maxCorr = corr; bestSlope = slope; }
    }
    return bestSlope;
  }

  const topSlope = measureStripSlope(Math.floor(docTop + docH * 0.25), Math.floor(docTop + docH * 0.52));
  const botSlope = measureStripSlope(Math.floor(docTop + docH * 0.52), Math.floor(docBot - docH * 0.04));

  const topW = topRightX - topLeftX;
  const botW = botRightX - botLeftX;

  const invScale = 1.0 / scale;
  const clampOrigX = (x) => Math.max(2, Math.min(origW - 3, Math.round(x * invScale)));
  const clampOrigY = (y) => Math.max(2, Math.min(origH - 3, Math.round(y * invScale)));

  return [
    { x: clampOrigX(topLeftX),  y: clampOrigY(docTop - topW * 0.5 * topSlope) }, // 0: TL
    { x: clampOrigX(topRightX), y: clampOrigY(docTop + topW * 0.5 * topSlope) }, // 1: TR
    { x: clampOrigX(botRightX), y: clampOrigY(docBot + botW * 0.5 * botSlope) }, // 2: BR
    { x: clampOrigX(botLeftX),  y: clampOrigY(docBot - botW * 0.5 * botSlope) }  // 3: BL
  ];
}

function openCropDeskewModal(imageSource, slotIndex) {
  cropDeskewState.slotIndex = (slotIndex !== undefined) ? slotIndex : (activeSlotIndex || 0);

  const setupAndShow = (imgElement) => {
    cropDeskewState.rawImage = imgElement;
    const w = imgElement.naturalWidth || imgElement.width;
    const h = imgElement.naturalHeight || imgElement.height;

    // Deteksi otomatis 4 sudut dokumen C-Plano di dalam bingkai foto
    let detected = null;
    try {
      detected = autoDetectCPlanoCornersFromElement(imgElement);
    } catch (eDet) {
      console.warn('Auto-detect corners fallback:', eDet);
    }

    if (detected && detected.length === 4) {
      cropDeskewState.corners = detected;
    } else {
      const mx = Math.round(w * 0.02);
      const my = Math.round(h * 0.02);
      cropDeskewState.corners = [
        { x: mx, y: my },
        { x: w - mx, y: my },
        { x: w - mx, y: h - my },
        { x: mx, y: h - my }
      ];
    }

    cropDeskewState.activeCornerIndex = -1;
    cropDeskewState.isDragging = false;
    cropDeskewState.dragMode = null;

    const titleEl = document.getElementById('cropSlotTitle');
    if (titleEl) {
      titleEl.textContent = `Pratinjau & Luruskan Halaman ${cropDeskewState.slotIndex + 1}`;
    }

    const modal = document.getElementById('cropDeskewModal');
    if (modal) modal.classList.add('active');

    setupCropInteractionListeners();
    requestAnimationFrame(() => {
      renderCropInteractionCanvas();
    });
  };

  if (typeof imageSource === 'string') {
    const img = new Image();
    img.onload = () => setupAndShow(img);
    img.src = imageSource;
  } else if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLCanvasElement) {
    setupAndShow(imageSource);
  }
}

function closeCropDeskewModal() {
  const modal = document.getElementById('cropDeskewModal');
  if (modal) modal.classList.remove('active');
  hideMagnifierLoupe();
  cropDeskewState.rawImage = null;
  cropDeskewState.activeCornerIndex = -1;
  cropDeskewState.isDragging = false;
  cropDeskewState.dragMode = null;
}

function cancelCropDeskew() {
  const idx = cropDeskewState.slotIndex;
  closeCropDeskewModal();
  openCameraModal(idx);
}

function setCropPreset(preset) {
  if (!cropDeskewState.rawImage) return;
  const w = cropDeskewState.rawImage.naturalWidth || cropDeskewState.rawImage.width;
  const h = cropDeskewState.rawImage.naturalHeight || cropDeskewState.rawImage.height;

  if (preset === 'paper') {
    // Deteksi ulang sudut otomatis mengikuti tepi kertas & kemiringan tabel C-Plano
    const detected = autoDetectCPlanoCornersFromElement(cropDeskewState.rawImage);
    if (detected && detected.length === 4) {
      cropDeskewState.corners = detected;
    } else {
      const mx = Math.round(w * 0.04);
      const my = Math.round(h * 0.04);
      cropDeskewState.corners = [
        { x: mx, y: my },
        { x: w - mx, y: my },
        { x: w - mx, y: h - my },
        { x: mx, y: h - my }
      ];
    }
    showAppToast('4 titik sudut otomatis disesuaikan ke kertas C-Plano.', 'info', 1600);
  } else if (preset === 'full') {
    // 100% penuh sesuai patokan bingkai kamera
    const margin = 2;
    cropDeskewState.corners = [
      { x: margin, y: margin },
      { x: w - margin, y: margin },
      { x: w - margin, y: h - margin },
      { x: margin, y: h - margin }
    ];
    showAppToast('Seleksi disetel penuh sesuai patokan bingkai.', 'info', 1600);
  }
  renderCropInteractionCanvas();
}

function resetCropCorners() {
  setCropPreset('paper');
}

function rotateRawCropImage() {
  if (!cropDeskewState.rawImage) return;
  const img = cropDeskewState.rawImage;
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = origH;
  rotCanvas.height = origW;
  const rctx = rotCanvas.getContext('2d');

  rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rctx.rotate((90 * Math.PI) / 180);
  rctx.drawImage(img, -origW / 2, -origH / 2);

  cropDeskewState.rawImage = rotCanvas;
  const detected = autoDetectCPlanoCornersFromElement(rotCanvas);
  if (detected && detected.length === 4) {
    cropDeskewState.corners = detected;
  } else {
    const mx = Math.round(rotCanvas.width * 0.03);
    const my = Math.round(rotCanvas.height * 0.03);
    cropDeskewState.corners = [
      { x: mx, y: my },
      { x: rotCanvas.width - mx, y: my },
      { x: rotCanvas.width - mx, y: rotCanvas.height - my },
      { x: mx, y: rotCanvas.height - my }
    ];
  }

  renderCropInteractionCanvas();
  showAppToast('Foto diputar 90°', 'info', 1400);
}

/**
 * Render Canvas Pratinjau Interaktif dengan Resolusi Retina / High-DPI
 */
function renderCropInteractionCanvas() {
  const canvas = document.getElementById('cropInteractionCanvas');
  const container = document.getElementById('cropEditorContainer');
  if (!canvas || !container || !cropDeskewState.rawImage) return;

  const img = cropDeskewState.rawImage;
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;

  const availW = Math.max(260, container.clientWidth - 8);
  const availH = Math.max(300, container.clientHeight - 8);

  const scale = Math.min(availW / imgW, availH / imgH, 1.0);
  cropDeskewState.displayScale = scale;

  const dispW = Math.round(imgW * scale);
  const dispH = Math.round(imgH * scale);

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cropDeskewState.dpr = dpr;

  canvas.width = Math.round(dispW * dpr);
  canvas.height = Math.round(dispH * dpr);
  canvas.style.width = `${dispW}px`;
  canvas.style.height = `${dispH}px`;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, dispW, dispH);

  // 1. Gambar latar belakang dokumen asli
  ctx.drawImage(img, 0, 0, dispW, dispH);

  const c = cropDeskewState.corners.map(pt => ({
    x: Math.round(pt.x * scale),
    y: Math.round(pt.y * scale)
  }));

  // 2. Lapisan bayangan (dark mask) di luar area segiempat yang dipilih
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.beginPath();
  ctx.rect(0, 0, dispW, dispH);
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.restore();

  // 3. Garis kisi-kisi bantu 3x3 di dalam segiempat
  ctx.save();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let t = 1; t <= 2; t++) {
    const f = t / 3;
    const hL = { x: c[0].x + (c[3].x - c[0].x) * f, y: c[0].y + (c[3].y - c[0].y) * f };
    const hR = { x: c[1].x + (c[2].x - c[1].x) * f, y: c[1].y + (c[2].y - c[1].y) * f };
    ctx.beginPath();
    ctx.moveTo(hL.x, hL.y);
    ctx.lineTo(hR.x, hR.y);
    ctx.stroke();

    const vT = { x: c[0].x + (c[1].x - c[0].x) * f, y: c[0].y + (c[1].y - c[0].y) * f };
    const vB = { x: c[3].x + (c[2].x - c[3].x) * f, y: c[3].y + (c[2].y - c[3].y) * f };
    ctx.beginPath();
    ctx.moveTo(vT.x, vT.y);
    ctx.lineTo(vB.x, vB.y);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Garis batas segiempat (Emas KPU cerah)
  ctx.save();
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 5. Gambar 4 handle pin sudut
  for (let k = 0; k < 4; k++) {
    const pt = c[k];
    const isActive = (cropDeskewState.activeCornerIndex === k);
    const radius = isActive ? 18 : 14;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius + 6, 0, 2 * Math.PI);
    ctx.fillStyle = isActive ? 'rgba(250, 204, 21, 0.55)' : 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isActive ? '#FACC15' : '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#800000';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = isActive ? '#800000' : '#0F172A';
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function updateMagnifierLoupe(rawCornerX, rawCornerY, clientX, clientY) {
  const loupe = document.getElementById('cropMagnifierLoupe');
  const magCanvas = document.getElementById('cropMagnifierCanvas');
  const editor = document.getElementById('cropEditorContainer');
  if (!loupe || !magCanvas || !editor || !cropDeskewState.rawImage) return;

  const rect = editor.getBoundingClientRect();
  let posX = clientX - rect.left - 45;
  let posY = clientY - rect.top - 110;
  if (posY < 10) posY = clientY - rect.top + 35;
  if (posX < 10) posX = 10;
  if (posX > rect.width - 100) posX = rect.width - 100;

  loupe.style.left = `${posX}px`;
  loupe.style.top = `${posY}px`;
  loupe.style.display = 'block';

  const mctx = magCanvas.getContext('2d');
  mctx.clearRect(0, 0, 90, 90);

  const zoom = 2.5;
  const rawBoxSize = 90 / zoom;
  const sx = rawCornerX - (rawBoxSize / 2);
  const sy = rawCornerY - (rawBoxSize / 2);

  mctx.drawImage(cropDeskewState.rawImage, sx, sy, rawBoxSize, rawBoxSize, 0, 0, 90, 90);
}

function hideMagnifierLoupe() {
  const loupe = document.getElementById('cropMagnifierLoupe');
  if (loupe) loupe.style.display = 'none';
}

function isPointInsidePolygon(px, py, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function setupCropInteractionListeners() {
  if (cropDeskewState.listenersAttached) return;
  const container = document.getElementById('cropEditorContainer');
  const canvas = document.getElementById('cropInteractionCanvas');
  if (!container || !canvas) return;

  const getCanvasCoords = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      cssW: rect.width,
      cssH: rect.height
    };
  };

  const findNearestCorner = (canvasX, canvasY) => {
    const scale = cropDeskewState.displayScale || 1;
    let minIdx = -1;
    let minDist = 75;
    for (let i = 0; i < 4; i++) {
      const c = cropDeskewState.corners[i];
      const cx = c.x * scale;
      const cy = c.y * scale;
      const dist = Math.hypot(cx - canvasX, cy - canvasY);
      if (dist < minDist) {
        minDist = dist;
        minIdx = i;
      }
    }
    return minIdx;
  };

  const handlePointerStart = (clientX, clientY, e) => {
    const coords = getCanvasCoords(clientX, clientY);
    const cornerIdx = findNearestCorner(coords.x, coords.y);

    if (cornerIdx !== -1) {
      cropDeskewState.activeCornerIndex = cornerIdx;
      cropDeskewState.isDragging = true;
      cropDeskewState.dragMode = 'corner';
      const corner = cropDeskewState.corners[cornerIdx];
      updateMagnifierLoupe(corner.x, corner.y, clientX, clientY);
      renderCropInteractionCanvas();
      if (e && e.cancelable) e.preventDefault();
    } else {
      const scale = cropDeskewState.displayScale || 1;
      const rawX = coords.x / scale;
      const rawY = coords.y / scale;
      if (isPointInsidePolygon(rawX, rawY, cropDeskewState.corners)) {
        cropDeskewState.isDragging = true;
        cropDeskewState.dragMode = 'pan';
        cropDeskewState.panStart = { x: rawX, y: rawY };
        cropDeskewState.initialCorners = cropDeskewState.corners.map(pt => ({ ...pt }));
        if (e && e.cancelable) e.preventDefault();
      }
    }
  };

  const handlePointerMove = (clientX, clientY, e) => {
    if (!cropDeskewState.isDragging) return;
    if (e && e.cancelable) e.preventDefault();

    const coords = getCanvasCoords(clientX, clientY);
    const scale = cropDeskewState.displayScale || 1;
    const img = cropDeskewState.rawImage;
    if (!img) return;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    if (cropDeskewState.dragMode === 'corner' && cropDeskewState.activeCornerIndex !== -1) {
      const rawX = Math.max(0, Math.min(imgW, Math.round(coords.x / scale)));
      const rawY = Math.max(0, Math.min(imgH, Math.round(coords.y / scale)));

      cropDeskewState.corners[cropDeskewState.activeCornerIndex] = { x: rawX, y: rawY };
      updateMagnifierLoupe(rawX, rawY, clientX, clientY);
      renderCropInteractionCanvas();
    } else if (cropDeskewState.dragMode === 'pan' && cropDeskewState.panStart) {
      const rawX = coords.x / scale;
      const rawY = coords.y / scale;
      const dx = Math.round(rawX - cropDeskewState.panStart.x);
      const dy = Math.round(rawY - cropDeskewState.panStart.y);

      cropDeskewState.corners = cropDeskewState.initialCorners.map(pt => ({
        x: Math.max(0, Math.min(imgW, pt.x + dx)),
        y: Math.max(0, Math.min(imgH, pt.y + dy))
      }));
      renderCropInteractionCanvas();
    }
  };

  const handlePointerEnd = () => {
    if (cropDeskewState.isDragging) {
      cropDeskewState.isDragging = false;
      cropDeskewState.activeCornerIndex = -1;
      cropDeskewState.dragMode = null;
      hideMagnifierLoupe();
      renderCropInteractionCanvas();
    }
  };

  container.addEventListener('pointerdown', (e) => {
    handlePointerStart(e.clientX, e.clientY, e);
  }, { passive: false });

  window.addEventListener('pointermove', (e) => {
    if (cropDeskewState.isDragging) {
      handlePointerMove(e.clientX, e.clientY, e);
    }
  }, { passive: false });

  window.addEventListener('pointerup', () => {
    handlePointerEnd();
  });
  window.addEventListener('pointercancel', () => {
    handlePointerEnd();
  });

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handlePointerStart(touch.clientX, touch.clientY, e);
    }
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (cropDeskewState.isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY, e);
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    handlePointerEnd();
  });

  window.addEventListener('resize', () => {
    if (cropDeskewState.rawImage && document.getElementById('cropDeskewModal')?.classList.contains('active')) {
      renderCropInteractionCanvas();
    }
  });

  cropDeskewState.listenersAttached = true;
}

/**
 * 8-Band Horizontal Table Line Dewarping
 * Menetralkan sisa kemiringan maupun lengkungan lipatan kertas C-Plano hingga 0.0° lurus sempurna
 */
function dewarpHorizontalLinesBuffer(warpedRgba, width, height) {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (warpedRgba[p] * 77 + warpedRgba[p + 1] * 150 + warpedRgba[p + 2] * 29) >> 8;
  }

  const numBands = 8;
  const numStrips = 12;
  const xMin = Math.floor(width * 0.08), xMax = Math.floor(width * 0.92);
  const stripW = Math.floor((xMax - xMin) / numStrips);
  const dxStep = 3 * stripW;
  const bandSlopes = new Float32Array(numBands);

  for (let b = 2; b < numBands; b++) {
    const cy = ((b + 0.5) / numBands) * height;
    const y0 = Math.max(12, Math.floor(cy - height * 0.075));
    const y1 = Math.min(height - 12, Math.floor(cy + height * 0.075));

    const strips = [];
    for (let s = 0; s < numStrips; s++) {
      const sx0 = xMin + s * stripW, sx1 = sx0 + stripW;
      const p = new Float32Array(height);
      for (let y = y0; y < y1; y++) {
        let sum = 0;
        const rowOff = y * width;
        for (let x = sx0; x < sx1; x += 2) {
          const c = lum[rowOff + x];
          const bg = (lum[(y - 4) * width + x] + lum[(y + 4) * width + x]) * 0.5;
          if (bg - c > 18 && c < 145) sum += (bg - c);
        }
        p[y] = sum;
      }
      strips.push(p);
    }

    const corrArr = new Float32Array(31);
    let bestDy = 0, maxC = -1;
    for (let dy = -15; dy <= 15; dy++) {
      let c = 0;
      for (let s = 0; s < numStrips - 3; s++) {
        if (s >= 3 && s <= 5) continue;
        const p1 = strips[s], p2 = strips[s + 3];
        for (let y = y0 + 16; y < y1 - 16; y++) {
          c += p1[y] * p2[y + dy];
        }
      }
      corrArr[dy + 15] = c;
      if (c > maxC) { maxC = c; bestDy = dy; }
    }
    let exactDy = bestDy;
    if (bestDy > -15 && bestDy < 15) {
      const cPrev = corrArr[bestDy - 1 + 15], cCurr = corrArr[bestDy + 15], cNext = corrArr[bestDy + 1 + 15];
      const denom = 2 * (2 * cCurr - cPrev - cNext);
      if (denom > 1e-3) exactDy = bestDy + (cNext - cPrev) / denom;
    }
    bandSlopes[b] = exactDy / dxStep;
  }

  bandSlopes[0] = bandSlopes[2];
  bandSlopes[1] = bandSlopes[2];

  const smoothSlopes = new Float32Array(numBands);
  for (let b = 0; b < numBands; b++) {
    smoothSlopes[b] = bandSlopes[Math.max(0, b - 1)] * 0.25 + bandSlopes[b] * 0.5 + bandSlopes[Math.min(numBands - 1, b + 1)] * 0.25;
  }

  const dewarped = new Uint8ClampedArray(width * height * 4);
  const halfW = width * 0.5;
  const bandStep = height / numBands;

  for (let y = 0; y < height; y++) {
    const bf = Math.max(0, Math.min(numBands - 1.001, (y - bandStep * 0.5) / bandStep));
    const b0 = bf | 0, b1 = Math.min(numBands - 1, b0 + 1);
    const bFrac = bf - b0;
    const slope = smoothSlopes[b0] * (1 - bFrac) + smoothSlopes[b1] * bFrac;

    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const sy = Math.max(0, Math.min(height - 1.001, y + (x - halfW) * slope));
      const y0 = sy | 0;
      const dy = sy - y0;
      const i0 = (y0 * width + x) * 4;
      const i1 = i0 + width * 4;
      const dstIdx = (rowOff + x) * 4;

      dewarped[dstIdx]     = warpedRgba[i0] * (1 - dy) + warpedRgba[i1] * dy;
      dewarped[dstIdx + 1] = warpedRgba[i0 + 1] * (1 - dy) + warpedRgba[i1 + 1] * dy;
      dewarped[dstIdx + 2] = warpedRgba[i0 + 2] * (1 - dy) + warpedRgba[i1 + 2] * dy;
      dewarped[dstIdx + 3] = 255;
    }
  }
  return dewarped;
}

/**
 * CamScanner Magic Color Document Clarifier
 * - Morphological Background Illumination Flattening (Meratakan bayangan lipatan & pencahayaan lampu ruangan)
 * - 3x3 High-Frequency Unsharp Mask (Menajamkan huruf cetak, garis tabel, angka & tanda tangan)
 * - True-Color Magic Enhancer:
 *   1. Kertas Putih Bersih (Background paper di-flatten menjadi putih terang tanpa noda/bayangan)
 *   2. Tinta Hitam Pekat (Teks cetak, barcode, garis tabel menjadi hitam tajam presisi)
 *   3. Tinta Pulpen Biru Asli (Tanda tangan saksi, tanggal, nama, angka tally dipertahankan & ditingkatkan menjadi warna biru royal/navy autentik)
 *   4. Cap/Stempel Merah/Ungu (Mempertahankan saturasi warna stempel resmi KPU/KPPS)
 */
function enhanceDocumentHDClarifierBuffer(warped, targetW, targetH) {
  const dst = new Uint8ClampedArray(warped.length);
  const STEP = 12;
  const GX = Math.ceil(targetW / STEP);
  const GY = Math.ceil(targetH / STEP);
  const maxGrid = new Float32Array(GX * GY);

  // 1. Ekstraksi Luminans Maksimum per Blok Grid
  for (let gy = 0; gy < GY; gy++) {
    const y0 = gy * STEP, y1 = Math.min(targetH, y0 + STEP);
    for (let gx = 0; gx < GX; gx++) {
      const x0 = gx * STEP, x1 = Math.min(targetW, x0 + STEP);
      let maxL = 100;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * targetW + x) * 4;
          const lum = (warped[i] * 77 + warped[i + 1] * 150 + warped[i + 2] * 29) >> 8;
          if (lum > maxL) maxL = lum;
        }
      }
      maxGrid[gy * GX + gx] = maxL;
    }
  }

  // 2. Dilatasi Morfologis 5x5 Grid (~60px radius untuk mendeteksi kertas putih di sekitar teks tebal)
  const dilatedGrid = new Float32Array(GX * GY);
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let maxV = maxGrid[gy * GX + gx];
      for (let dy = -2; dy <= 2; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= GY) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= GX) continue;
          const v = maxGrid[ny * GX + nx];
          if (v > maxV) maxV = v;
        }
      }
      dilatedGrid[gy * GX + gx] = maxV;
    }
  }

  // 3. Penghalusan Iluminasi Kertas Latar (Moving Average 5x5)
  const smoothBg = new Float32Array(GX * GY);
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let s = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= GY) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= GX) continue;
          s += dilatedGrid[ny * GX + nx]; c++;
        }
      }
      smoothBg[gy * GX + gx] = Math.max(120, s / c);
    }
  }

  // 4. Transformasi Magic Color per Piksel dengan Penajaman & Preservasi Tinta Biru/Warna
  for (let y = 0; y < targetH; y++) {
    const fy = Math.max(0, Math.min(GY - 1.001, (y - STEP * 0.5) / STEP));
    const gy0 = fy | 0, gy1 = Math.min(GY - 1, gy0 + 1);
    const dy = fy - gy0;
    const rowOff = y * targetW;
    const isInnerY = (y > 0 && y < targetH - 1);

    for (let x = 0; x < targetW; x++) {
      const fx = Math.max(0, Math.min(GX - 1.001, (x - STEP * 0.5) / STEP));
      const gx0 = fx | 0, gx1 = Math.min(GX - 1, gx0 + 1);
      const dx = fx - gx0;

      const bg = smoothBg[gy0 * GX + gx0] * (1 - dx) * (1 - dy) +
                 smoothBg[gy0 * GX + gx1] * dx * (1 - dy) +
                 smoothBg[gy1 * GX + gx0] * (1 - dx) * dy +
                 smoothBg[gy1 * GX + gx1] * dx * dy;

      const i = (rowOff + x) * 4;
      const r = warped[i], g = warped[i + 1], b = warped[i + 2];
      const lum = (r * 77 + g * 150 + b * 29) >> 8;

      let lap = 0;
      if (isInnerY && x > 0 && x < targetW - 1) {
        const iUp = i - targetW * 4, iDn = i + targetW * 4, iLf = i - 4, iRt = i + 4;
        const lumUp = (warped[iUp] * 77 + warped[iUp + 1] * 150 + warped[iUp + 2] * 29) >> 8;
        const lumDn = (warped[iDn] * 77 + warped[iDn + 1] * 150 + warped[iDn + 2] * 29) >> 8;
        const lumLf = (warped[iLf] * 77 + warped[iLf + 1] * 150 + warped[iLf + 2] * 29) >> 8;
        const lumRt = (warped[iRt] * 77 + warped[iRt + 1] * 150 + warped[iRt + 2] * 29) >> 8;
        lap = (lum * 4) - (lumUp + lumDn + lumLf + lumRt);
      }

      const sharpLum = lum + lap * 0.60;
      const norm = Math.max(0, Math.min(1.05, sharpLum / bg));

      // Jika area kertas putih bersih (norm >= 0.94)
      if (norm >= 0.94) {
        dst[i]     = 255;
        dst[i + 1] = 255;
        dst[i + 2] = 255;
        dst[i + 3] = 255;
        continue;
      }

      // Deteksi Tinta Biru (Pulpen KPPS / Saksi)
      // Pada lampu ruangan hangat/kuning: kertas memiliki r > b, sehingga pulpen biru dicirikan b >= r atau b - r > 0
      const diffBR = b - r;
      const diffBG = b - g;
      const blueScore = b - (r + g) * 0.5;
      const isBlueInk = (diffBR >= 1 || blueScore >= 1.0) && (diffBG >= -12) && (norm < 0.92);

      let blueWeight = 0;
      if (isBlueInk) {
        blueWeight = Math.min(1.0, Math.max(0.0, Math.max(diffBR, blueScore) / 7.0));
      }

      // Deteksi Tinta Merah/Stempel Cap
      const redScore = r - Math.max(g, b);
      let redWeight = 0;
      if (redScore >= 14 && norm < 0.92) {
        redWeight = Math.min(1.0, Math.max(0.0, (redScore - 14) / 14.0));
      }

      // Bobot transisi ke kertas putih di pinggir goresan (0.86 - 0.94)
      const wPaper = Math.max(0.0, Math.min(1.0, (norm - 0.86) / 0.08));

      // 1. Teks Netral / Garis Cetak Hitam (S-curve kontras tinggi)
      const t = Math.min(1.0, Math.max(0.0, norm / 0.90));
      const targetLum = Math.pow(t, 2.05) * 242;
      const scale = targetLum / Math.max(1, lum);
      const rNeut = Math.min(255, r * scale) * (1 - wPaper) + 255 * wPaper;
      const gNeut = Math.min(255, g * scale) * (1 - wPaper) + 255 * wPaper;
      const bNeut = Math.min(255, b * scale) * (1 - wPaper) + 255 * wPaper;

      // 2. Tinta Pulpen Biru Royal / Navy Autentik (#182bab / #1e40af)
      const inkDepth = Math.min(1.0, Math.max(0.0, (0.92 - norm) / 0.40));
      const rBlue = (18 + (1 - inkDepth) * 55) * (1 - wPaper) + 255 * wPaper;
      const gBlue = (45 + (1 - inkDepth) * 65) * (1 - wPaper) + 255 * wPaper;
      const bBlue = (170 + (1 - inkDepth) * 65) * (1 - wPaper) + 255 * wPaper;

      // 3. Stempel Cap Merah Autentik
      const rRed = (215 + (1 - inkDepth) * 35) * (1 - wPaper) + 255 * wPaper;
      const gRed = (25 + (1 - inkDepth) * 45) * (1 - wPaper) + 255 * wPaper;
      const bRed = (25 + (1 - inkDepth) * 45) * (1 - wPaper) + 255 * wPaper;

      const colWeight = Math.min(1.0, blueWeight + redWeight);
      const finalR = rNeut * (1 - colWeight) + rBlue * blueWeight + rRed * redWeight;
      const finalG = gNeut * (1 - colWeight) + gBlue * blueWeight + gRed * redWeight;
      const finalB = bNeut * (1 - colWeight) + bBlue * blueWeight + bRed * redWeight;

      dst[i]     = Math.min(255, Math.max(0, (finalR + 0.5) | 0));
      dst[i + 1] = Math.min(255, Math.max(0, (finalG + 0.5) | 0));
      dst[i + 2] = Math.min(255, Math.max(0, (finalB + 0.5) | 0));
      dst[i + 3] = 255;
    }
  }
  return dst;
}

/**
 * Pipeline Transformasi Perspektif Bilinear Sub-Piksel + 8-Band Dewarping + CamScanner HD Clarifier
 */
function warpPerspectiveCanvas(sourceImg, p0, p1, p2, p3, outCanvas) {
  const targetW = outCanvas.width;
  const targetH = outCanvas.height;
  const outCtx = outCanvas.getContext('2d');

  const srcW = sourceImg.naturalWidth || sourceImg.width;
  const srcH = sourceImg.naturalHeight || sourceImg.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(sourceImg, 0, 0);

  const srcRgba = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const warped = new Uint8ClampedArray(targetW * targetH * 4);

  // 1. Bilinear Sub-Pixel Quad Mapping (Bebas distorsi silang proyektif & bebas gerigi)
  for (let y = 0; y < targetH; y++) {
    const v = y / Math.max(1, targetH - 1);
    const lx = (1 - v) * p0.x + v * p3.x;
    const rx = (1 - v) * p1.x + v * p2.x;
    const ly = (1 - v) * p0.y + v * p3.y;
    const ry = (1 - v) * p1.y + v * p2.y;
    const dxRow = (rx - lx) / Math.max(1, targetW - 1);
    const dyRow = (ry - ly) / Math.max(1, targetW - 1);

    let fx = lx, fy = ly;
    const rowOff = y * targetW;

    for (let x = 0; x < targetW; x++) {
      const cx = Math.max(0, Math.min(srcW - 1.001, fx));
      const cy = Math.max(0, Math.min(srcH - 1.001, fy));
      const x0 = cx | 0, y0 = cy | 0;
      const dx = cx - x0, dy = cy - y0;
      const w00 = (1 - dx) * (1 - dy), w10 = dx * (1 - dy), w01 = (1 - dx) * dy, w11 = dx * dy;
      const i00 = (y0 * srcW + x0) * 4, i10 = i00 + 4, i01 = i00 + srcW * 4, i11 = i01 + 4;
      const dstIdx = (rowOff + x) * 4;

      warped[dstIdx]     = srcRgba[i00] * w00 + srcRgba[i10] * w10 + srcRgba[i01] * w01 + srcRgba[i11] * w11;
      warped[dstIdx + 1] = srcRgba[i00 + 1] * w00 + srcRgba[i10 + 1] * w10 + srcRgba[i01 + 1] * w01 + srcRgba[i11 + 1] * w11;
      warped[dstIdx + 2] = srcRgba[i00 + 2] * w00 + srcRgba[i10 + 2] * w10 + srcRgba[i01 + 2] * w01 + srcRgba[i11 + 2] * w11;
      warped[dstIdx + 3] = 255;

      fx += dxRow;
      fy += dyRow;
    }
  }

  // 2. 8-Band Horizontal Table Line Dewarping (Menetralkan sisa kemiringan garis tabel ke 0.0°)
  const dewarped = dewarpHorizontalLinesBuffer(warped, targetW, targetH);

  // 3. CamScanner HD Document Clarifier (Meratakan bayangan lipatan & menajamkan teks/angka)
  const enhanced = enhanceDocumentHDClarifierBuffer(dewarped, targetW, targetH);

  const dstImgData = outCtx.createImageData(targetW, targetH);
  dstImgData.data.set(enhanced);
  outCtx.putImageData(dstImgData, 0, 0);
}

/**
 * Eksekusi Transformasi Perspektif CamScanner Pro, Pemotongan & Penyimpanan ke Slot Halaman
 */
function applyPerspectiveCropAndSave() {
  if (!cropDeskewState.rawImage) return;

  showLoading('Meluruskan & Menajamkan...', 'Menerapkan pelurus perspektif otomatis & penajam dokumen HD...');

  setTimeout(() => {
    try {
      const p0 = cropDeskewState.corners[0]; // Top-Left
      const p1 = cropDeskewState.corners[1]; // Top-Right
      const p2 = cropDeskewState.corners[2]; // Bottom-Right
      const p3 = cropDeskewState.corners[3]; // Bottom-Left

      const topWidth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const bottomWidth = Math.hypot(p2.x - p3.x, p2.y - p3.y);
      let targetWidth = Math.max(topWidth, bottomWidth);

      const leftHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const rightHeight = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      let targetHeight = Math.max(leftHeight, rightHeight);

      // Resolusi optimal (hingga 1850px sisi panjang) agar tajam namun sangat cepat & hemat kuota PDF
      const MAX_DIM = 1850;
      if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      } else {
        targetWidth = Math.round(targetWidth);
        targetHeight = Math.round(targetHeight);
      }

      targetWidth = Math.max(300, targetWidth);
      targetHeight = Math.max(300, targetHeight);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = targetWidth;
      outCanvas.height = targetHeight;

      // Jalankan Pipeline CamScanner Pro (Bilinear Warp + 8-Band Dewarp + HD Clarifier)
      warpPerspectiveCanvas(cropDeskewState.rawImage, p0, p1, p2, p3, outCanvas);
      outCanvas._alreadyEnhanced = true;

      // Terapkan kompresi standar dokumen SIMAMBIL
      const compressedDataUrl = compressImageCanvas(outCanvas);

      const idx = cropDeskewState.slotIndex;
      pagesState[idx].dataUrl = compressedDataUrl;
      pagesState[idx].rotation = 0;

      renderPageSlots();
      closeCropDeskewModal();
      hideLoading();

      // Simpan progres ke IndexedDB (Anti-Restart Resilience)
      saveSessionDraft();

      showAppToast(`✓ Halaman ${idx + 1} berhasil diluruskan & ditajamkan!`, 'success', 2600);
    } catch (errWarp) {
      console.error('Gagal meluruskan dokumen:', errWarp);
      hideLoading();
      showAppToast('Gagal memproses pelurusan dokumen. Silakan coba kembali.', 'error', 3000);
    }
  }, 40);
}

function reCropCurrentPhoto() {
  if (activeSlotIndex === null) return;
  const slot = pagesState[activeSlotIndex];
  if (!slot || !slot.dataUrl) return;

  closePreviewModal();
  const img = new Image();
  img.onload = () => {
    openCropDeskewModal(img, activeSlotIndex);
  };
  img.src = slot.dataUrl;
}

/**
 * Kompresi Resolusi Canvas Client-Side (Resolusi Tinggi & Jernih untuk C-Plano)
 * Orientasi Dinamis (Portrait / Landscape) tanpa pemotongan resolusi:
 * - <= 3 Halaman (PPWP, DPD, Pilgub, Pilbup): Max 2200 x 1650 (3.63 Megapixel), Kualitas JPEG 0.80
 * - 20 Halaman (DPR, DPRD): Max 1750 x 1300 (2.27 Megapixel), Kualitas JPEG 0.72
 * Ditambah kurva kontras & kecerahan dokumen agar teks hitam dan angka perolehan suara pekat tajam.
 * Menjamin dokumen <=3 Halaman selalu berada di bawah kuota 1 MB.
 */
function compressImageCanvas(img, rotationDegree = 0) {
  const currentTargetPages = typeof getTargetPagesForCurrentLembaga === 'function' ? getTargetPagesForCurrentLembaga() : 3;
  const isMultiPage20 = currentTargetPages > 3;

  // Batas resolusi sisi panjang dan sisi pendek berbasis orientasi nyata
  const MAX_LONG_EDGE = isMultiPage20 ? 1750 : 2200;
  const MAX_SHORT_EDGE = isMultiPage20 ? 1300 : 1650;
  const initialQuality = isMultiPage20 ? 0.72 : 0.80;

  let origWidth = img.naturalWidth || img.width;
  let origHeight = img.naturalHeight || img.height;

  // Tentukan apakah gambar portrait (vertikal) atau landscape (horizontal)
  const isPortrait = origHeight >= origWidth;
  let targetWidth = origWidth;
  let targetHeight = origHeight;

  if (isPortrait) {
    if (targetHeight > MAX_LONG_EDGE) {
      targetWidth = Math.round((targetWidth * MAX_LONG_EDGE) / targetHeight);
      targetHeight = MAX_LONG_EDGE;
    }
    if (targetWidth > MAX_SHORT_EDGE) {
      targetHeight = Math.round((targetHeight * MAX_SHORT_EDGE) / targetWidth);
      targetWidth = MAX_SHORT_EDGE;
    }
  } else {
    if (targetWidth > MAX_LONG_EDGE) {
      targetHeight = Math.round((targetHeight * MAX_LONG_EDGE) / targetWidth);
      targetWidth = MAX_LONG_EDGE;
    }
    if (targetHeight > MAX_SHORT_EDGE) {
      targetWidth = Math.round((targetWidth * MAX_SHORT_EDGE) / targetHeight);
      targetHeight = MAX_SHORT_EDGE;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (rotationDegree === 90 || rotationDegree === 270) {
    canvas.width = targetHeight;
    canvas.height = targetWidth;
  } else {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  // Terapkan peningkatan kontras dokumen agar teks/angka tulisan tangan pekat dan latar belakang bersih
  if ('filter' in ctx && !img._alreadyEnhanced) {
    ctx.filter = 'contrast(1.06) brightness(1.02)';
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotationDegree * Math.PI) / 180);

  if (rotationDegree === 90 || rotationDegree === 270) {
    ctx.drawImage(img, -targetHeight / 2, -targetWidth / 2, targetHeight, targetWidth);
  } else {
    ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
  }
  ctx.restore();

  // Batas target byte per halaman agar total PDF selalu berada di bawah kuota (1 MB untuk <=3 Hal, 5 MB untuk 20 Hal)
  // Untuk 3 Halaman: 820 KB / 3 = ~273 KB per halaman. PDF total ~900 KB (aman di bawah 1.024 KB)
  // Untuk 20 Halaman: 4.2 MB / 20 = ~210 KB per halaman. PDF total ~4.5 MB (aman di bawah 5.120 KB)
  const maxBytesPerPage = isMultiPage20 ? (215 * 1024) : Math.min(295 * 1024, Math.round((885 * 1024) / Math.max(1, currentTargetPages)));

  let currentQuality = initialQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
  let approxBytes = Math.round((dataUrl.length * 3) / 4);

  let attempts = 0;
  while (approxBytes > maxBytesPerPage && currentQuality > 0.48 && attempts < 4) {
    currentQuality -= 0.07;
    dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.46, currentQuality));
    approxBytes = Math.round((dataUrl.length * 3) / 4);
    attempts++;
  }

  return dataUrl;
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
    saveSessionDraft();
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
      saveSessionDraft();
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

  const kategori = document.getElementById('selectKategoriPemilihan')?.value || '';
  const jenisFile = document.getElementById('selectJenisFile')?.value || '';
  const lembaga = document.getElementById('selectLembaga')?.value || '';
  const kecamatan = document.getElementById('selectKecamatan')?.value || '';
  const desa = document.getElementById('selectDesa')?.value || '';
  const tps = document.getElementById('selectTPS')?.value || '';

  if (!kategori) {
    showAppDialog({
      title: 'Pilih Jenis Pemilihan Terlebih Dahulu',
      type: 'warning',
      message: 'Harap tentukan pilihan <strong>Jenis Pemilihan (Pemilu atau Pilkada)</strong> terlebih dahulu sebelum menyimpan dokumen.',
      confirmText: 'Pilih Sekarang',
      onConfirm: () => {
        const trig = document.getElementById('triggerKategoriPemilihan');
        if (trig) trig.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

  if (!jenisFile || !lembaga) {
    showAppDialog({
      title: 'Pilih Metadata Terlebih Dahulu',
      type: 'warning',
      message: 'Harap tentukan pilihan <strong>Jenis Berkas Dokumen</strong> dan <strong>Jenis Lembaga</strong> terlebih dahulu sebelum menyimpan dokumen.',
      confirmText: 'Pilih Sekarang',
      onConfirm: () => {
        const trig = !jenisFile ? document.getElementById('triggerJenisFile') : document.getElementById('triggerLembaga');
        if (trig) trig.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

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

      // Watermark Stempel Wilayah & Waktu & Operator di margin bawah (Adaptif 1 Baris)
      doc.setTextColor(90);
      const timestampStr = new Date().toLocaleString('id-ID');
      const watermarkText = `SIMAMBIL KPU Kab. Gorontalo | ${kecamatan} - ${desa} - TPS ${formatTpsNum(tps)} | Operator: ${op.nama} (${op.nip}) | Hal ${i + 1}/${filledSlots.length} | ${timestampStr}`;

      const maxFooterWidth = renderWidth; // 190 mm
      let footerFontSize = 7.5;
      doc.setFontSize(footerFontSize);

      if (typeof doc.getTextWidth === 'function') {
        const textWidth = doc.getTextWidth(watermarkText);
        if (textWidth > maxFooterWidth) {
          // Perkecil ukuran huruf secara dinamis dan proporsional agar 100% pas dalam 1 baris
          footerFontSize = Math.max(4.0, Number(((footerFontSize * (maxFooterWidth / textWidth)) * 0.97).toFixed(2)));
          doc.setFontSize(footerFontSize);
        }
      }

      doc.text(watermarkText, margin, pageHeight - 5);

      updateProgress(25 + Math.round(((i + 1) / filledSlots.length) * 45));
    }

    updateProgress(75);
    showLoading('Mengunggah Dokumen...', 'Menyimpan berkas dan mencatat rekap...');

    // 2. Konversi ke Base64 Data URI
    let pdfBase64 = doc.output('datauristring');

    // 2a. Validasi Batasan Ukuran Berkas Client-Side & Multi-Pass Auto-Optimizer
    // SOT: Dokumen <= 3 Halaman maks 1 MB (1.024 KB), Dokumen > 3 Halaman maks 5 MB (5.120 KB)
    const targetPages = TARGET_HALAMAN[lembaga] || 3;
    const isThreePages = targetPages <= 3;
    const maxAllowedBytes = isThreePages ? (1 * 1024 * 1024) : (5 * 1024 * 1024);
    const maxMbLabel = isThreePages ? '1 MB' : '5 MB';

    let base64Clean = pdfBase64.indexOf(',') > -1 ? pdfBase64.split(',')[1] : pdfBase64;
    let actualSizeBytes = Math.round((base64Clean.length * 3) / 4);

    // Multi-pass auto-optimizer: Jika ukuran PDF melebihi kuota (misal 1.09 MB > 1.00 MB),
    // kompresi ulang secara otomatis di latar belakang tanpa melempar popup error ke operator
    if (actualSizeBytes > maxAllowedBytes) {
      showLoading('Mengoptimalkan Ukuran PDF...', 'Menyesuaikan kompresi otomatis agar pas di bawah batas kuota 1 MB...');
      try {
        pdfBase64 = await recompilePdfWithAutoOptimization(filledSlots, targetPages, maxAllowedBytes, kecamatan, desa, tps, op);
        base64Clean = pdfBase64.indexOf(',') > -1 ? pdfBase64.split(',')[1] : pdfBase64;
        actualSizeBytes = Math.round((base64Clean.length * 3) / 4);
      } catch (optErr) {
        console.warn('Auto-optimizer error, melanjutkan:', optErr);
      }
    }

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
        kategori: getKategoriForLembaga(lembaga),
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

      if (resJson && resJson.fileUrl) {
        const docKey = `${kecamatan}|${desa}|${formatTpsNum(tps)}|${lembaga}`;
        sessionUploadedDocsMap.set(docKey, {
          fileUrl: resJson.fileUrl,
          fileId: resJson.fileId,
          fileName: resJson.fileName || fileName
        });
      }

      onUploadSuccess(resJson, { kecamatan, desa, tps, fileName, lembaga });

    } else {
      // Mock upload simulator jika URL belum diisi
      setTimeout(() => {
        onUploadSuccess({
          status: 'success',
          message: 'Simulasi: Dokumen berhasil di-render secara lokal (koneksi ke Google Drive sedang offline)',
          fileName: fileName
        }, { kecamatan, desa, tps, fileName, lembaga });
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

/**
 * Auto-Optimizer PDF Kompilasi Ulang (Zero-Error Quota Engine)
 * Memastikan dokumen yang melebihi batas kuota (seperti kasus 1.09 MB > 1.00 MB)
 * secara otomatis dikompresi ulang ke anggaran per-halaman yang aman
 * tanpa mengorbankan keterbacaan teks dan angka C-Plano.
 */
async function recompilePdfWithAutoOptimization(filledSlots, targetPages, maxAllowedBytes, kecamatan, desa, tps, op) {
  const isMultiPage20 = targetPages > 3;
  // Alokasikan batas byte gambar keseluruhan ~74% dari kuota PDF agar sisa 26% cukup untuk header PDF & xref
  const targetPerSlotBytes = Math.floor((maxAllowedBytes * 0.74) / Math.max(1, filledSlots.length));

  const optimizedSlots = await Promise.all(filledSlots.map(slot => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const scale = 0.88; // Turunkan dimensi 12% untuk menghemat byte secara efisien
        c.width = Math.round((img.naturalWidth || img.width) * scale);
        c.height = Math.round((img.naturalHeight || img.height) * scale);
        const ctx = c.getContext('2d');
        if ('filter' in ctx) ctx.filter = 'contrast(1.06) brightness(1.02)';
        ctx.drawImage(img, 0, 0, c.width, c.height);

        let q = isMultiPage20 ? 0.65 : 0.72;
        let dataUrl = c.toDataURL('image/jpeg', q);
        let b = Math.round((dataUrl.length * 3) / 4);
        let step = 0;
        while (b > targetPerSlotBytes && q > 0.44 && step < 3) {
          q -= 0.08;
          dataUrl = c.toDataURL('image/jpeg', Math.max(0.42, q));
          b = Math.round((dataUrl.length * 3) / 4);
          step++;
        }
        resolve({ dataUrl: dataUrl, page: slot.page });
      };
      img.onerror = () => resolve(slot);
      img.src = slot.dataUrl;
    });
  }));

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

  for (let i = 0; i < optimizedSlots.length; i++) {
    if (i > 0) doc.addPage();
    doc.addImage(optimizedSlots[i].dataUrl, 'JPEG', margin, margin, renderWidth, renderHeight, undefined, 'FAST');

    doc.setTextColor(90);
    const timestampStr = new Date().toLocaleString('id-ID');
    const watermarkText = `SIMAMBIL KPU Kab. Gorontalo | ${kecamatan} - ${desa} - TPS ${formatTpsNum(tps)} | Operator: ${op.nama} (${op.nip}) | Hal ${i + 1}/${optimizedSlots.length} | ${timestampStr}`;

    let footerFontSize = 7.5;
    doc.setFontSize(footerFontSize);
    if (typeof doc.getTextWidth === 'function') {
      const textWidth = doc.getTextWidth(watermarkText);
      if (textWidth > renderWidth) {
        footerFontSize = Math.max(4.0, Number(((footerFontSize * (renderWidth / textWidth)) * 0.97).toFixed(2)));
        doc.setFontSize(footerFontSize);
      }
    }
    doc.text(watermarkText, margin, pageHeight - 5);
  }

  return doc.output('datauristring');
}

/**
 * Helper Evaluasi Kelengkapan TPS per Desa & Auto-Advance Sesi Wilayah
 * SOT: User Request - Pertahankan Kecamatan & Desa yang sedang didokumentasikan
 * sampai seluruh TPS di wilayah tersebut selesai dirender & dikirim.
 * Jika seluruh TPS selesai, reset pilihan wilayah ke default.
 */
function checkDesaCompletionAndAdvance(kecamatan, desa, currentTps) {
  if (!masterDataCache || !kecamatan || !desa) {
    return { allCompleted: true, nextTps: null };
  }

  const kecObj = masterDataCache.wilayah.find(w => w.kecamatan === kecamatan);
  const desaObj = kecObj ? kecObj.desaList.find(d => d.desa === desa) : null;
  const tpsList = desaObj ? (desaObj.tpsList || []) : [];

  if (tpsList.length === 0) {
    return { allCompleted: true, nextTps: null };
  }

  const normCurrentTps = formatTpsNum(currentTps);
  const currentIndex = tpsList.findIndex(t => formatTpsNum(t) === normCurrentTps);

  // Ambil data TPS di desa ini dari allRekapRecords terkini
  const desaRecords = allRekapRecords.filter(r => r.kecamatan === kecamatan && r.desa === desa);

  // Identifikasi TPS yang belum memiliki dokumen atau masih kosong
  const pendingTpsList = tpsList.filter(t => {
    const normT = formatTpsNum(t);
    // TPS yang baru saja sukses diunggah pasti sudah bukan pending
    if (normT === normCurrentTps) return false;
    const rec = desaRecords.find(r => formatTpsNum(r.tps) === normT);
    return !rec || rec.status === 'KOSONG';
  });

  if (pendingTpsList.length === 0) {
    // Seluruh TPS di desa ini sudah selesai dirender dan dikirim!
    return {
      allCompleted: true,
      nextTps: null,
      totalTps: tpsList.length
    };
  }

  // Masih ada TPS yang belum diunggah di desa ini.
  // Cari TPS berikutnya setelah currentIndex dalam urutan, atau ambil yang pertama di pending list
  let nextTps = pendingTpsList.find(t => {
    const idx = tpsList.findIndex(x => formatTpsNum(x) === formatTpsNum(t));
    return idx > currentIndex;
  });

  if (!nextTps) {
    nextTps = pendingTpsList[0];
  }

  return {
    allCompleted: false,
    nextTps: nextTps,
    remainingCount: pendingTpsList.length,
    totalTps: tpsList.length
  };
}

function resetWilayahSelectionToDefault() {
  const selectKec = document.getElementById('selectKecamatan');
  const selectDesa = document.getElementById('selectDesa');
  const selectTPS = document.getElementById('selectTPS');

  if (selectKec) selectKec.value = '';
  if (selectDesa) {
    selectDesa.innerHTML = '<option value="">-- Pilih Kecamatan Terlebih Dahulu --</option>';
    selectDesa.value = '';
    selectDesa.disabled = true;
  }
  if (selectTPS) {
    selectTPS.innerHTML = '<option value="">-- Pilih Desa Terlebih Dahulu --</option>';
    selectTPS.value = '';
    selectTPS.disabled = true;
  }

  updateGeneratedFilename();
  syncAllPickers();
}

function onUploadSuccess(res, meta = {}) {
  updateProgress(100);
  hideLoading();

  if (res && res.status === 'success') {
    initPagesState();
    clearSessionDraft();
    renderPageSlots();
    loadRekapData();

    const kecamatan = meta.kecamatan || document.getElementById('selectKecamatan')?.value || '';
    const desa = meta.desa || document.getElementById('selectDesa')?.value || '';
    const currentTps = meta.tps || document.getElementById('selectTPS')?.value || '';

    // Evaluasi apakah masih ada TPS yang perlu didokumentasikan di desa ini
    const advanceInfo = checkDesaCompletionAndAdvance(kecamatan, desa, currentTps);

    if (advanceInfo.allCompleted) {
      // Seluruh TPS di wilayah desa ini telah selesai: reset wilayah ke default
      resetWilayahSelectionToDefault();
    } else {
      // Pertahankan wilayah Kecamatan dan Desa, otomatis beralih ke TPS berikutnya
      const selectKec = document.getElementById('selectKecamatan');
      const selectDesa = document.getElementById('selectDesa');
      const selectTPS = document.getElementById('selectTPS');

      if (selectKec) selectKec.value = kecamatan;
      if (selectDesa) {
        selectDesa.value = desa;
        selectDesa.disabled = false;
      }
      if (selectTPS && advanceInfo.nextTps) {
        selectTPS.value = advanceInfo.nextTps;
        selectTPS.disabled = false;
      }

      updateGeneratedFilename();
      syncAllPickers();
    }

    showAppDialog({
      title: 'Dokumen Berhasil Diunggah!',
      type: 'success',
      message: `Dokumen berhasil disimpan<br><br><div style="font-family:monospace; font-size:11.5px; background:#F8FAFC; border:1px solid #E2E8F0; padding:6px 10px; border-radius:8px; word-break:break-all; color:#1E293B;">${escapeHtml(res.fileName || meta.fileName || '')}</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 10px; text-align: center;">💡 Pratinjau berkas dapat dilihat melalui menu <strong>Rekap &amp; Pratinjau</strong>.</div>`,
      confirmText: 'Lanjutkan'
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
function onRekapKecamatanChange(skipFetch = false) {
  const filterKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const filterDesa = document.getElementById('filterRekapDesa');

  if (filterDesa) {
    const currentDesa = filterDesa.value;
    filterDesa.innerHTML = '<option value="">-- Semua Desa --</option>';

    if (filterKec && masterDataCache) {
      const activeWil = getActiveWilayahList();
      const kecObj = activeWil.find(w => w.kecamatan === filterKec);
      if (kecObj && kecObj.desaList) {
        kecObj.desaList.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.desa;
          opt.textContent = d.desa;
          filterDesa.appendChild(opt);
        });
        if (currentDesa && kecObj.desaList.some(d => d.desa === currentDesa)) {
          filterDesa.value = currentDesa;
        } else {
          filterDesa.value = '';
        }
      }
    }
  }

  // Hitung ulang metrik KPI dan saring tampilan TPS/Wilayah secara instan (0ms)
  recalculateRekapForCurrentCategory();

  if (!skipFetch) {
    loadRekapData();
  }
  syncAllPickers();
}

function onRekapDesaChange() {
  // Hitung ulang metrik KPI dan saring tampilan TPS/Wilayah secara instan (0ms)
  recalculateRekapForCurrentCategory();
  loadRekapData();
  syncAllPickers();
}

async function refreshAllData() {
  showAppToast('Menyinkronkan master wilayah & rekapitulasi...', 'info', 2500);
  try {
    localStorage.removeItem(STORAGE_KEY_REKAP);
    localStorage.removeItem(getRekapStorageKey('PEMILU'));
    localStorage.removeItem(getRekapStorageKey('PILKADA'));
    localStorage.removeItem(STORAGE_KEY_MASTER);
  } catch (e) {}

  await Promise.allSettled([
    loadMasterData(true),
    loadRekapData(true)
  ]);
  showAppToast('Data mutakhir berhasil disinkronkan dari Spreadsheet!', 'success', 2500);
}

async function loadRekapData(isManualRefresh = false) {
  const filterKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const filterDesa = document.getElementById('filterRekapDesa')?.value || '';
  const apiUrl = AppConfig.getApiUrl();
  const isGlobalFilter = !filterKec && !filterDesa;

  if (isManualRefresh) {
    showAppToast('Menyinkronkan data monitoring terbaru...', 'info', 2000);
  }

  const qParams = new URLSearchParams({
    action: 'getMonitoringSummary',
    kecamatan: filterKec,
    desa: filterDesa,
    kategori: currentRekapKategori,
    refresh: isManualRefresh ? '1' : '0',
    _t: Date.now().toString()
  });

  const authToken = AppConfig.getAuthToken ? AppConfig.getAuthToken() : '';
  if (authToken) {
    qParams.append('token', authToken);
  }

  // 1. Coba endpoint utama (Proxy Vercel / GAS)
  if (apiUrl) {
    try {
      const endpoint = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${qParams.toString()}`;
      const res = await fetchWithTimeout(endpoint, {
        redirect: 'follow',
        cache: 'no-store'
      }, 12000);
      const json = await res.json();
      if (json && json.status === 'success') {
        onRekapDataLoaded(json);
        if (isGlobalFilter) {
          try {
            localStorage.setItem(getRekapStorageKey(currentRekapKategori), JSON.stringify(json));
          } catch (eStorage) {}
        }
        if (isManualRefresh) {
          showAppToast('Data monitoring berhasil diperbarui!', 'success', 2500);
        }
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
      const res = await fetchWithTimeout(directEndpoint, {
        redirect: 'follow',
        cache: 'no-store'
      }, 12000);
      const json = await res.json();
      if (json && json.status === 'success') {
        onRekapDataLoaded(json);
        if (isGlobalFilter) {
          try {
            localStorage.setItem(getRekapStorageKey(currentRekapKategori), JSON.stringify(json));
          } catch (eStorage) {}
        }
        if (isManualRefresh) {
          showAppToast('Data monitoring berhasil diperbarui!', 'success', 2500);
        }
        return;
      }
    } catch (e2) {
      console.warn('Fallback direct GAS URL rekap juga gagal:', e2);
    }
  }

  // 3. Fallback jika offline total dan belum ada data
  if (allRekapRecords.length === 0 && (!rekapKecamatanList || rekapKecamatanList.length === 0)) {
    const fallback = getLocalFallbackMonitoring(filterKec, filterDesa);
    onRekapDataLoaded(fallback);
  }

  if (isManualRefresh) {
    showAppToast('Koneksi lambat. Menampilkan data tersimpan di perangkat.', 'warning', 3000);
  }
}

function buildInitialRecordsFromActiveMaster(kategori = currentRekapKategori) {
  const activeWil = getActiveWilayahList(kategori);
  if (!activeWil || activeWil.length === 0) return false;

  const targetKeys = getTargetKeysForCategory(kategori);
  const records = [];

  activeWil.forEach(k => {
    (k.desaList || []).forEach(d => {
      (d.tpsList || []).forEach(tps => {
        records.push({
          kecamatan: k.kecamatan,
          desa: d.desa,
          tps: tps,
          status: 'KOSONG',
          catStatus: 'KOSONG',
          catCompleteCount: 0,
          catTotalTarget: targetKeys.length,
          totalLengkap: 0,
          totalUpload: 0,
          targetTotal: targetKeys.length,
          rincian: {},
          detailHalaman: {}
        });
      });
    });
  });

  if (records.length > 0) {
    allRekapRecords = records;
    recalculateRekapForCurrentCategory();
    return true;
  }
  return false;
}

function onRekapDataLoaded(res) {
  if (!res || res.status !== 'success') return;

  const statTotal = document.getElementById('statTotalTPS');
  const statLengkap = document.getElementById('statLengkap');
  const statBelum = document.getElementById('statBelumLengkap');
  const statKosong = document.getElementById('statKosong');

  const rawRecords = res.records || [];

  // Helper normalisasi key wilayah (kebal variasi spasi, strip, huruf besar/kecil)
  const normKey = (k, d, t) => {
    const ck = String(k || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
    const cd = String(d || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
    const num = parseInt(String(t).replace(/\D/g, ''), 10);
    const ct = isNaN(num) ? '001' : ('000' + num).slice(-3);
    return ck + '|' + cd + '|' + ct;
  };

  // Deduplikasi & Normalisasi Records: Menghindari anomali duplikasi seperti TALAGA JAYA vs TALAGA-JAYA
  const dedupedMap = new Map();
  const activeWil = getActiveWilayahList();
  rawRecords.forEach(rec => {
    const key = normKey(rec.kecamatan, rec.desa, rec.tps);
    if (!dedupedMap.has(key)) {
      // Normalisasi nama kecamatan ke bentuk baku dari master data jika tersedia
      if (activeWil && activeWil.length > 0) {
        const canonicalKecObj = activeWil.find(w => w.kecamatan.replace(/[\s\-_]+/g, '') === rec.kecamatan.replace(/[\s\-_]+/g, ''));
        if (canonicalKecObj) {
          rec.kecamatan = canonicalKecObj.kecamatan;
          const canonicalDesaObj = canonicalKecObj.desaList?.find(d => d.desa.replace(/[\s\-_]+/g, '') === rec.desa.replace(/[\s\-_]+/g, ''));
          if (canonicalDesaObj) rec.desa = canonicalDesaObj.desa;
        }
      }
      dedupedMap.set(key, rec);
    } else {
      const existing = dedupedMap.get(key);
      // Prioritaskan record yang sudah memiliki upload dokumen
      if (existing.status === 'KOSONG' && rec.status !== 'KOSONG') {
        rec.kecamatan = existing.kecamatan;
        dedupedMap.set(key, rec);
      }
    }
  });

  let cleanRecords = Array.from(dedupedMap.values());

  // Validasi Kategori Pilkada: Jika data Pilkada di master data sudah terdefinisi,
  // pastikan hanya TPS Pilkada yang dimasukkan (mencegah anomali 1205 TPS Pemilu dari deployment GAS lama)
  if (currentRekapKategori === 'PILKADA' && masterDataCache && masterDataCache.wilayahPilkada && masterDataCache.wilayahPilkada.length > 0) {
    const curFilterKec = document.getElementById('filterRekapKecamatan')?.value || '';
    const curFilterDesa = document.getElementById('filterRekapDesa')?.value || '';
    const normCurKec = curFilterKec ? curFilterKec.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';
    const normCurDesa = curFilterDesa ? curFilterDesa.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';

    const pilkadaTpsSet = new Set();
    const pilkadaTpsTemplate = new Map();
    masterDataCache.wilayahPilkada.forEach(k => {
      const kNorm = String(k.kecamatan || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
      if (normCurKec && kNorm !== normCurKec) return;

      (k.desaList || []).forEach(d => {
        const dNorm = String(d.desa || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
        if (normCurDesa && dNorm !== normCurDesa) return;

        (d.tpsList || []).forEach(t => {
          const kKey = normKey(k.kecamatan, d.desa, t);
          pilkadaTpsSet.add(kKey);
          pilkadaTpsTemplate.set(kKey, { kecamatan: k.kecamatan, desa: d.desa, tps: t });
        });
      });
    });

    if (pilkadaTpsSet.size > 0) {
      const filtered = cleanRecords.filter(rec => pilkadaTpsSet.has(normKey(rec.kecamatan, rec.desa, rec.tps)));
      const existingKeys = new Set(filtered.map(rec => normKey(rec.kecamatan, rec.desa, rec.tps)));
      
      pilkadaTpsTemplate.forEach((val, kKey) => {
        if (!existingKeys.has(kKey)) {
          filtered.push({
            kecamatan: val.kecamatan,
            desa: val.desa,
            tps: val.tps,
            status: 'KOSONG',
            catStatus: 'KOSONG',
            totalLengkap: 0,
            totalUpload: 0,
            targetTotal: 2,
            rincian: { 'PILGUB': false, 'PILBUP': false },
            detailHalaman: {}
          });
        }
      });
      cleanRecords = filtered;
    }
  }

  allRekapRecords = cleanRecords;

  // Evaluasi metrik ringkasan dan status per record berbasis kategori aktif (Pemilu 5 / Pilkada 2)
  recalculateRekapForCurrentCategory();
}

/**
 * Pengaturan Kategori Pemilihan pada Rekapitulasi (Segmented Buttons & Filter Dropdown)
 * Memisahkan evaluasi kelengkapan dokumen Pemilu (5 Lembaga) vs Pilkada (2 Lembaga)
 */
function setRekapCategory(kategori) {
  if (!kategori) kategori = 'PEMILU';
  currentRekapKategori = kategori;

  // 1. Sinkronisasi segmented buttons (Hanya Pemilu & Pilkada)
  const tabPemilu = document.getElementById('btnCatPemilu');
  const tabPilkada = document.getElementById('btnCatPilkada');
  if (tabPemilu) tabPemilu.classList.toggle('active', kategori === 'PEMILU');
  if (tabPilkada) tabPilkada.classList.toggle('active', kategori === 'PILKADA');

  // 2. Sinkronisasi dropdown filter di Filter Card
  const filterSelect = document.getElementById('filterRekapKategori');
  if (filterSelect && filterSelect.value !== kategori) {
    filterSelect.value = kategori;
  }

  // 3. Update Label Kartu KPI Lengkap
  const labelEl = document.getElementById('statLengkapLabel');
  if (labelEl) {
    if (kategori === 'PILKADA') labelEl.textContent = '🟢 Lengkap (2/2)';
    else labelEl.textContent = '🟢 Lengkap (5/5)';
  }

  // Perbarui dropdown filter kecamatan & desa rekap
  onRekapKecamatanChange(true);
  syncAllPickers();

  // 4. Hidrasi instan dari cache lokal kategori jika tersedia (0ms)
  const catCacheRaw = localStorage.getItem(getRekapStorageKey(kategori));
  if (catCacheRaw) {
    try {
      const parsed = JSON.parse(catCacheRaw);
      if (parsed && parsed.status === 'success') {
        onRekapDataLoaded(parsed);
      }
    } catch (e) {}
  } else if (kategori === 'PILKADA' && masterDataCache && masterDataCache.wilayahPilkada && masterDataCache.wilayahPilkada.length > 0) {
    buildInitialRecordsFromActiveMaster('PILKADA');
  } else {
    recalculateRekapForCurrentCategory();
  }

  // 5. Sinkronisasi latar belakang dengan server jika menggunakan sheet terpisah Master_Wilayah_Pilkada
  loadRekapData();
}

function onRekapKategoriFilterChanged() {
  const filterSelect = document.getElementById('filterRekapKategori');
  const val = filterSelect ? filterSelect.value : 'PEMILU';
  setRekapCategory(val);
}

function evaluateRecordForCategory(rec, kategori = currentRekapKategori) {
  const keys = getTargetKeysForCategory(kategori);
  let completeCount = 0;
  let hasAnyUpload = false;

  keys.forEach(k => {
    const detail = rec.detailHalaman && rec.detailHalaman[k];
    const targetHal = TARGET_HALAMAN[k] || 3;
    if (detail) {
      if (detail.actual > 0) hasAnyUpload = true;
      if (detail.lengkap || detail.actual >= targetHal) completeCount++;
    } else if (rec.rincian && rec.rincian[k]) {
      hasAnyUpload = true;
      completeCount++;
    }
  });

  let status = 'KOSONG';
  if (completeCount === keys.length) {
    status = 'LENGKAP';
  } else if (hasAnyUpload || completeCount > 0) {
    status = 'BELUM LENGKAP';
  }

  return {
    status: status,
    completeCount: completeCount,
    totalTarget: keys.length,
    targetKeys: keys
  };
}

function recalculateRekapForCurrentCategory() {
  if (!allRekapRecords || allRekapRecords.length === 0) return;

  const curFilterKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const curFilterDesa = document.getElementById('filterRekapDesa')?.value || '';
  const normFilterKec = curFilterKec ? curFilterKec.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';
  const normFilterDesa = curFilterDesa ? curFilterDesa.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';

  let countLengkap = 0;
  let countBelum = 0;
  let countKosong = 0;
  let scopedTotal = 0;

  allRekapRecords.forEach(rec => {
    const evalResult = evaluateRecordForCategory(rec, currentRekapKategori);
    rec.catStatus = evalResult.status;
    rec.catCompleteCount = evalResult.completeCount;
    rec.catTotalTarget = evalResult.totalTarget;

    const recKecNorm = String(rec.kecamatan || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
    const recDesaNorm = String(rec.desa || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');

    const matchesKec = !normFilterKec || (recKecNorm === normFilterKec);
    const matchesDesa = !normFilterDesa || (recDesaNorm === normFilterDesa);

    if (matchesKec && matchesDesa) {
      scopedTotal++;
      if (rec.catStatus === 'LENGKAP') countLengkap++;
      else if (rec.catStatus === 'BELUM LENGKAP') countBelum++;
      else countKosong++;
    }
  });

  const statTotal = document.getElementById('statTotalTPS');
  const statLengkap = document.getElementById('statLengkap');
  const statBelum = document.getElementById('statBelumLengkap');
  const statKosong = document.getElementById('statKosong');

  if (statTotal) statTotal.textContent = scopedTotal;
  if (statLengkap) statLengkap.textContent = countLengkap;
  if (statBelum) statBelum.textContent = countBelum;
  if (statKosong) statKosong.textContent = countKosong;

  const labelEl = document.getElementById('statLengkapLabel');
  if (labelEl) {
    if (currentRekapKategori === 'PILKADA') labelEl.textContent = '🟢 Lengkap (2/2)';
    else labelEl.textContent = '🟢 Lengkap (5/5)';
  }

  // Re-agregasi kecamatan otomatis dari records terverifikasi agar total kecamatan murni 19 tanpa duplikat
  rekapKecamatanList = getAggregatedRekapKecamatan(true);

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

function getAggregatedRekapKecamatan(force = false) {
  if (!force && rekapKecamatanList && rekapKecamatanList.length > 0) {
    // Validasi apakah rekapKecamatanList bebas dari anomali duplikasi
    const uniqueKec = new Set(rekapKecamatanList.map(k => k.kecamatan.replace(/[\s\-_]+/g, '')));
    if (uniqueKec.size === rekapKecamatanList.length && rekapKecamatanList.length <= 19) {
      return rekapKecamatanList;
    }
  }

  const kecMap = new Map();
  allRekapRecords.forEach(rec => {
    let canonicalKec = rec.kecamatan;
    if (masterDataCache && masterDataCache.wilayah) {
      const matchKec = masterDataCache.wilayah.find(w => w.kecamatan.replace(/[\s\-_]+/g, '') === rec.kecamatan.replace(/[\s\-_]+/g, ''));
      if (matchKec) canonicalKec = matchKec.kecamatan;
    }

    if (!kecMap.has(canonicalKec)) {
      kecMap.set(canonicalKec, {
        kecamatan: canonicalKec,
        totalTPS: 0,
        lengkap: 0,
        belumLengkap: 0,
        kosong: 0,
        desaMap: new Map()
      });
    }
    const kObj = kecMap.get(canonicalKec);
    kObj.totalTPS++;
    const status = rec.catStatus || rec.status;
    if (status === 'LENGKAP') kObj.lengkap++;
    else if (status === 'BELUM LENGKAP') kObj.belumLengkap++;
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
    if (status === 'LENGKAP') dObj.lengkap++;
    else if (status === 'BELUM LENGKAP') {
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

  if (list.length > 0) {
    list.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));
    rekapKecamatanList = list;
    return list;
  }

  // Fallback awal: Buat struktur ringkasan dari Master Data jika rekapitulasi belum diterima dari server
  const fallbackWilayah = getActiveWilayahList();
  if (fallbackWilayah && fallbackWilayah.length > 0) {
    const list = fallbackWilayah.map(k => {
      const desaList = (k.desaList || []).map(d => {
        const tpsList = d.tpsList || [];
        return {
          desa: d.desa,
          totalTPS: tpsList.length,
          lengkap: 0,
          belumLengkap: 0,
          kosong: tpsList.length,
          tpsKosong: [...tpsList],
          tpsBelumLengkap: []
        };
      });

      const totalTPS = desaList.reduce((acc, d) => acc + d.totalTPS, 0);
      return {
        kecamatan: k.kecamatan,
        totalTPS: totalTPS,
        lengkap: 0,
        belumLengkap: 0,
        kosong: totalTPS,
        persenLengkap: 0,
        desaList: desaList
      };
    });
    return list;
  }

  return [];
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
  const selectedKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const selectedDesa = document.getElementById('filterRekapDesa')?.value || '';
  const normSelectedKec = selectedKec ? selectedKec.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';
  const normSelectedDesa = selectedDesa ? selectedDesa.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';

  let filtered = data.filter(k => {
    // 1. Filter dropdown Kecamatan di atasnya
    if (normSelectedKec) {
      const kNorm = String(k.kecamatan || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
      if (kNorm !== normSelectedKec) return false;
    }

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

  // Jika Desa dipilih pada dropdown atas, filter juga rincian desa di dalam kecamatan
  if (normSelectedDesa) {
    filtered = filtered.map(k => {
      const copy = Object.assign({}, k);
      copy.desaList = (k.desaList || []).filter(d => String(d.desa || '').trim().toUpperCase().replace(/[\s\-_]+/g, '') === normSelectedDesa);
      return copy;
    });
  }

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
    const isStillLoading = (!masterDataCache || !masterDataCache.wilayah || masterDataCache.wilayah.length === 0) &&
                           (!rekapKecamatanList || rekapKecamatanList.length === 0);
    container.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-muted);">
        ${isStillLoading ? `
          <div style="margin: 0 auto 10px auto; width: 26px; height: 26px; border: 3px solid #E2E8F0; border-top-color: var(--kpu-maroon); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="font-weight: 600; font-size: 13px; color: #1E293B;">Memuat Ringkasan Wilayah...</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 4px;">Menghubungkan ke basis data rekapitulasi KPU</div>
        ` : (currentWilayahFilter === 'PENDING' ? '🎉 Seluruh wilayah telah tuntas diunggah!' : 'Tidak ada data kecamatan yang cocok dengan kriteria filter.')}
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

  const selectedKec = document.getElementById('filterRekapKecamatan')?.value || '';
  const selectedDesa = document.getElementById('filterRekapDesa')?.value || '';
  const normSelectedKec = selectedKec ? selectedKec.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';
  const normSelectedDesa = selectedDesa ? selectedDesa.trim().toUpperCase().replace(/[\s\-_]+/g, '') : '';

  let filtered = allRekapRecords.filter(r => {
    // 1. Filter dropdown Kecamatan di atasnya
    if (normSelectedKec) {
      const recKecNorm = String(r.kecamatan || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
      if (recKecNorm !== normSelectedKec) return false;
    }

    // 2. Filter dropdown Desa di atasnya
    if (normSelectedDesa) {
      const recDesaNorm = String(r.desa || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
      if (recDesaNorm !== normSelectedDesa) return false;
    }

    // 3. Filter status KPI
    const status = r.catStatus || r.status;
    if (currentRekapFilterStatus !== 'ALL' && status !== currentRekapFilterStatus) {
      return false;
    }

    // 4. Filter keyword pencarian
    if (searchKeyword) {
      const matchKec = r.kecamatan.toLowerCase().includes(searchKeyword);
      const matchDesa = r.desa.toLowerCase().includes(searchKeyword);
      const matchTps = ('tps ' + r.tps).includes(searchKeyword) || r.tps.includes(searchKeyword);
      return matchKec || matchDesa || matchTps;
    }
    return true;
  });

  // Urutkan filtered: TPS yang memiliki dokumen (BELUM LENGKAP atau LENGKAP) selalu tampil di urutan teratas
  filtered.sort((a, b) => {
    const aStatus = a.catStatus || a.status;
    const bStatus = b.catStatus || b.status;
    const aHasDoc = aStatus !== 'KOSONG' ? 1 : 0;
    const bHasDoc = bStatus !== 'KOSONG' ? 1 : 0;
    if (aHasDoc !== bHasDoc) {
      return bHasDoc - aHasDoc; // Status aktif (LENGKAP/BELUM LENGKAP) tampil paling awal
    }
    if (a.kecamatan !== b.kecamatan) return a.kecamatan.localeCompare(b.kecamatan);
    if (a.desa !== b.desa) return a.desa.localeCompare(b.desa);
    return a.tps.localeCompare(b.tps);
  });

  const activeList = filtered.filter(r => (r.catStatus || r.status) !== 'KOSONG');
  const emptyList = filtered.filter(r => (r.catStatus || r.status) === 'KOSONG');
  // Seluruh TPS yang ada dokumennya wajib selalu dirender penuh, disusul hingga 200 TPS kosong
  const displayList = [...activeList, ...emptyList.slice(0, 200)];

  if (countLabel) {
    let scopeText = '';
    if (selectedKec) {
      scopeText = ` • ${selectedDesa ? 'Desa ' + selectedDesa + ', ' : ''}Kec. ${selectedKec}`;
    }
    if (filtered.length > displayList.length) {
      countLabel.textContent = `Menampilkan ${displayList.length} dari ${filtered.length} TPS${scopeText} (TPS Berisi Ditampilkan Teratas)`;
    } else {
      countLabel.textContent = `Menampilkan ${filtered.length} TPS${scopeText}`;
    }
  }

  if (filtered.length === 0) {
    const scopeMsg = selectedKec ? ` di ${selectedDesa ? 'Desa ' + selectedDesa + ', ' : ''}Kecamatan ${selectedKec}` : '';
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        Tidak ada data TPS yang cocok dengan kriteria filter${scopeMsg}.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  displayList.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'rekap-item-card';

    const recStatus = rec.catStatus || rec.status;
    let badgeClass = 'kosong';
    let statusIcon = '🔴';
    if (recStatus === 'LENGKAP') {
      badgeClass = 'lengkap';
      statusIcon = '🟢';
    } else if (recStatus === 'BELUM LENGKAP') {
      badgeClass = 'belum';
      statusIcon = '🟡';
    }

    const targetKeys = getTargetKeysForCategory(currentRekapKategori);
    const catCompleteCount = rec.catCompleteCount !== undefined ? rec.catCompleteCount : (recStatus === 'LENGKAP' ? targetKeys.length : (rec.totalUpload || 0));

    // Analisis apakah ada dokumen yang halamannya hilang / kurang dari target pada kategori aktif
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

    // Mini Chips Lembaga Sesuai Kategori Aktif (5 Pemilu / 2 Pilkada / 7 Semua)
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

      // Ambil fileUrl atau fileId dari detailHalaman atau dari session map
      const normT = formatTpsNum(rec.tps);
      const sessionKey = `${rec.kecamatan}|${rec.desa}|${normT}|${k}`;
      const sessionDoc = sessionUploadedDocsMap.get(sessionKey);
      const docFileUrl = (detail && detail.fileUrl) || (sessionDoc && sessionDoc.fileUrl) || '';
      const docFileId = (detail && detail.fileId) || (sessionDoc && sessionDoc.fileId) || '';

      const btnPreview = (actualHal > 0 && (docFileUrl || docFileId)) ? `
        <button type="button" class="btn-preview-direct" onclick="event.stopPropagation(); openDocumentPreview('${escapeJs(docFileUrl)}', '${escapeJs(docFileId)}', '${escapeJs(fullName)}', '${escapeJs(rec.kecamatan)}', '${escapeJs(rec.desa)}', '${escapeJs(rec.tps)}')">
          Pratinjau 👁️
        </button>
      ` : '';

      breakdownRowsHtml += `
        <div class="breakdown-row">
          <div class="breakdown-row-left">
            <span class="breakdown-name">${escapeHtml(fullName)}</span>
            <span class="breakdown-sub">Target: ${targetHal} Halaman</span>
          </div>
          <div class="breakdown-row-right">
            ${badgeHtml}
            ${btnPreview}
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
          <span class="rekap-tps-sub">Kec. ${rec.kecamatan} • Kelengkapan: <strong>${catCompleteCount}/${targetKeys.length} Lembaga</strong></span>
        </div>
        <div>
          <span class="status-badge ${badgeClass}" style="white-space: nowrap;">${statusIcon} ${recStatus}</span>
        </div>
      </div>
      ${alertBannerHtml}
      ${chipsHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 4px; margin-top: 2px;">
        <button type="button" class="rekap-toggle-btn" onclick="event.stopPropagation(); toggleRekapBreakdown('${cardId}', this)">
          <span>📋 Rincian Halaman ${targetKeys.length} Lembaga</span> <span class="arrow-icon">▾</span>
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
  const selectJenis = document.getElementById('selectJenisFile');
  if (selectJenis && !selectJenis.value) {
    selectJenis.value = 'Model C-Plano';
  }
  const kategori = getKategoriForLembaga(kodeLembaga);
  const selectKategori = document.getElementById('selectKategoriPemilihan');
  if (selectKategori) {
    selectKategori.value = kategori;
    applyKategoriPemilihanChange(kategori, false);
  }
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

/**
 * ==============================================================================
 * PRATINJAU DOKUMEN PDF (REKAP & PRATINJAU)
 * Menampilkan berkas resmi Google Drive dalam modal terpadu tanpa membuka tab eksternal
 * ==============================================================================
 */
function openDocumentPreview(fileUrl, fileId, title, kec, desa, tps) {
  const modal = document.getElementById('previewDocModal');
  const modalTitle = document.getElementById('previewDocModalTitle');
  const modalSub = document.getElementById('previewDocModalSub');
  const iframe = document.getElementById('previewDocIframe');
  const btnExternal = document.getElementById('previewDocBtnExternal');

  let targetFileId = fileId;
  if (!targetFileId && fileUrl) {
    const match = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) targetFileId = match[1];
  }

  const directViewUrl = fileUrl || (targetFileId ? `https://drive.google.com/file/d/${targetFileId}/view?usp=sharing` : '#');
  const embedUrl = targetFileId ? `https://drive.google.com/file/d/${targetFileId}/preview` : directViewUrl;

  if (modalTitle) modalTitle.textContent = title ? `Pratinjau: ${title}` : 'Pratinjau Dokumen';
  if (modalSub) modalSub.textContent = `📍 Kec. ${kec} • Desa ${desa} • TPS ${tps}`;
  if (btnExternal) {
    btnExternal.href = directViewUrl;
  }
  if (iframe) {
    iframe.src = embedUrl;
  }

  if (modal) modal.classList.add('active');
}

function closeDocumentPreviewModal() {
  const modal = document.getElementById('previewDocModal');
  const iframe = document.getElementById('previewDocIframe');
  if (iframe) iframe.src = 'about:blank';
  if (modal) modal.classList.remove('active');
}

function escapeJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function selectTPSFromRekap(kec, desa, tps) {
  switchTab('camera');

  const selectKec = document.getElementById('selectKecamatan');
  if (selectKec) {
    selectKec.value = kec;
    onKecamatanChanged(desa, tps);
  }

  const selectDesa = document.getElementById('selectDesa');
  if (selectDesa) {
    selectDesa.value = desa;
    onDesaChanged(tps);
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
  { selectId: 'selectKategoriPemilihan', labelId: 'labelKategoriPemilihan', triggerId: 'triggerKategoriPemilihan' },
  { selectId: 'selectJenisFile', labelId: 'labelJenisFile', triggerId: 'triggerJenisFile' },
  { selectId: 'selectLembaga', labelId: 'labelLembaga', triggerId: 'triggerLembaga' },
  { selectId: 'selectKecamatan', labelId: 'labelKecamatan', triggerId: 'triggerKecamatan' },
  { selectId: 'selectDesa', labelId: 'labelDesa', triggerId: 'triggerDesa' },
  { selectId: 'selectTPS', labelId: 'labelTPS', triggerId: 'triggerTPS' },
  { selectId: 'filterRekapKategori', labelId: 'labelFilterRekapKategori', triggerId: 'triggerFilterRekapKategori' },
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
    if (selectId === 'selectLembaga') {
      showAppToast('Harap pilih Jenis Pemilihan (Pemilu/Pilkada) terlebih dahulu.', 'warning');
    } else if (selectId === 'selectDesa') {
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

  // Nonaktifkan auto-focus keyboard: biarkan operator leluasa memilih opsi yang tampil,
  // keyboard hanya akan muncul saat operator mengetuk kolom pencarian
  if (searchInput) {
    searchInput.blur();
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
