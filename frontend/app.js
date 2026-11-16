/**
 * ==============================================================================
 * SIMAMBIL - Frontend Logic (Decoupled Vercel Edition)
 * SOT Reference: 02-USER-FLOW.md, 03-UI-GUIDELINE.md, 05-API-SPEC.md, 06-BUSINESS-RULES.md
 * ==============================================================================
 */

// Global State
const MAX_PAGES = 20;
let pagesState = []; // [{ page: 1, dataUrl: null, rotation: 0 }, ...]
let activeSlotIndex = null;
let currentFacingMode = 'environment';
let cameraStream = null;
let masterDataCache = null;
let allRekapRecords = [];
let currentRekapFilterStatus = 'ALL';

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  checkApiConfigNotice();
  initPagesState();
  renderPageSlots();
  loadMasterData();
  setupNetworkListeners();
  registerPWA();
});

/**
 * ==============================================================================
 * 1. CONFIGURATION & BANNER NOTICE
 * ==============================================================================
 */
function checkApiConfigNotice() {
  const banner = document.getElementById('configNoticeBanner');
  if (banner) {
    banner.style.display = AppConfig.isConfigured() ? 'none' : 'flex';
  }
}

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
  checkApiConfigNotice();
}

function saveGasUrl() {
  const input = document.getElementById('inputGasUrl');
  const val = (input?.value || '').trim();

  if (val && !val.startsWith('https://script.google.com')) {
    alert('URL Google Apps Script harus diawali dengan https://script.google.com');
    return;
  }

  AppConfig.setApiUrl(val);
  alert('URL Google Apps Script berhasil disimpan!');
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
function initPagesState() {
  pagesState = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    pagesState.push({
      page: i + 1,
      dataUrl: null,
      rotation: 0
    });
  }
}

async function loadMasterData() {
  const apiUrl = AppConfig.getApiUrl();

  // 1. Coba endpoint utama (Proxy /api/gas jika di Vercel atau Direct URL)
  if (apiUrl) {
    try {
      const endpoint = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}action=getMasterData`;
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
      const directEndpoint = `${DIRECT_GAS_URL}?action=getMasterData`;
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
  
  if (selectKec) {
    selectKec.innerHTML = '<option value="">-- Pilih Kecamatan --</option>';
  }
  if (selectFilterKec) {
    selectFilterKec.innerHTML = '<option value="">-- Semua Kecamatan (19 Kecamatan) --</option>';
  }

  res.wilayah.forEach(item => {
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

  // Set default pilihan pertama
  if (selectKec && res.wilayah.length > 0) {
    selectKec.value = res.wilayah[0].kecamatan;
    onKecamatanChanged();
  }

  // Muat data awal monitoring
  loadRekapData();
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
function renderPageSlots() {
  const container = document.getElementById('pageSlotsGrid');
  if (!container) return;
  container.innerHTML = '';

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
      `;
    }

    container.appendChild(card);
  });

  const badge = document.getElementById('pageCountBadge');
  if (badge) {
    badge.textContent = `${filledCount} / ${MAX_PAGES} Terisi`;
    badge.style.backgroundColor = filledCount > 0 ? 'var(--status-green)' : 'var(--kpu-maroon)';
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

  if (confirm(`Apakah Anda yakin ingin menghapus seluruh ${filledCount} foto halaman yang sudah diambil?`)) {
    initPagesState();
    renderPageSlots();
  }
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
 * Batas Maksimal: 1600x1200, Kualitas JPEG 0.75
 */
function compressImageCanvas(img, rotationDegree = 0) {
  const MAX_WIDTH = 1600;
  const MAX_HEIGHT = 1200;

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

  return canvas.toDataURL('image/jpeg', 0.75);
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
  if (confirm(`Hapus foto pada Halaman ${activeSlotIndex + 1}?`)) {
    pagesState[activeSlotIndex].dataUrl = null;
    pagesState[activeSlotIndex].rotation = 0;
    renderPageSlots();
    closePreviewModal();
  }
}

/**
 * ==============================================================================
 * 6. CLIENT-SIDE PDF COMPILER & HTTP POST REST UPLOAD
 * SOT: 02-USER-FLOW.md, 05-API-SPEC.md, 06-BUSINESS-RULES.md
 * ==============================================================================
 */
async function startRenderAndUpload() {
  const filledSlots = pagesState.filter(p => p.dataUrl !== null);
  if (filledSlots.length === 0) {
    alert('Harap ambil minimal 1 foto halaman dokumen sebelum render.');
    return;
  }

  const jenisFile = document.getElementById('selectJenisFile')?.value || 'Model C-Plano';
  const lembaga = document.getElementById('selectLembaga')?.value || 'PPWP';
  const kecamatan = document.getElementById('selectKecamatan')?.value || '';
  const desa = document.getElementById('selectDesa')?.value || '';
  const tps = document.getElementById('selectTPS')?.value || '';

  if (!kecamatan || !desa || !tps) {
    alert('Harap lengkapi pilihan Kecamatan, Desa, dan Nomor TPS!');
    return;
  }

  const fileName = updateGeneratedFilename();

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

      // Watermark Stempel Wilayah & Waktu di margin bawah
      doc.setFontSize(8);
      doc.setTextColor(100);
      const timestampStr = new Date().toLocaleString('id-ID');
      const watermarkText = `SIMAMBIL KPU | ${kecamatan} - ${desa} - TPS ${formatTpsNum(tps)} | Hal ${i + 1}/${filledSlots.length} | ${timestampStr}`;
      doc.text(watermarkText, margin, pageHeight - 5);

      updateProgress(25 + Math.round(((i + 1) / filledSlots.length) * 45));
    }

    updateProgress(75);
    showLoading('Mengunggah ke Google Drive...', 'Menyimpan berkas dan mencatat rekap...');

    // 2. Konversi ke Base64 Data URI
    const pdfBase64 = doc.output('datauristring');

    const payload = {
      action: 'uploadDocument',
      fileName: fileName,
      mimeType: 'application/pdf',
      base64Data: pdfBase64,
      metadata: {
        jenisFile: jenisFile,
        lembaga: lembaga,
        kecamatan: kecamatan,
        desa: desa,
        tps: formatTpsNum(tps),
        totalHalaman: filledSlots.length
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
          message: 'Simulasi: Dokumen berhasil di-render! (Harap atur URL Apps Script di menu pengaturan untuk upload riil ke Drive)',
          fileName: fileName
        });
      }, 1500);
    }

  } catch (err) {
    hideLoading();
    alert('Terjadi kesalahan saat memproses upload: ' + err.message);
  }
}

function onUploadSuccess(res) {
  updateProgress(100);
  hideLoading();

  if (res && res.status === 'success') {
    alert(`BERHASIL!\n\n${res.message}\nBerkas: ${res.fileName}`);
    initPagesState();
    renderPageSlots();
    loadRekapData();
  } else {
    alert('Gagal mengunggah berkas: ' + (res.message || 'Kesalahan sistem backend.'));
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
  renderRekapList();
}

function filterRekapStatus(status) {
  currentRekapFilterStatus = status;
  
  const btns = ['btnFilterAll', 'btnFilterKosong', 'btnFilterBelum', 'btnFilterLengkap'];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('btn-gold');
  });

  if (status === 'ALL') document.getElementById('btnFilterAll')?.classList.add('btn-gold');
  if (status === 'KOSONG') document.getElementById('btnFilterKosong')?.classList.add('btn-gold');
  if (status === 'BELUM LENGKAP') document.getElementById('btnFilterBelum')?.classList.add('btn-gold');
  if (status === 'LENGKAP') document.getElementById('btnFilterLengkap')?.classList.add('btn-gold');

  renderRekapList();
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
    card.onclick = () => selectTPSFromRekap(rec.kecamatan, rec.desa, rec.tps);

    let badgeClass = 'kosong';
    let statusIcon = '🔴';
    if (rec.status === 'LENGKAP') {
      badgeClass = 'lengkap';
      statusIcon = '🟢';
    } else if (rec.status === 'BELUM LENGKAP') {
      badgeClass = 'belum';
      statusIcon = '🟡';
    }

    card.innerHTML = `
      <div class="rekap-item-left">
        <span class="rekap-tps-title">TPS ${rec.tps} - ${rec.desa}</span>
        <span class="rekap-tps-sub">Kec. ${rec.kecamatan} • Terupload: ${rec.totalUpload || 0}/7 Lembaga</span>
      </div>
      <div>
        <span class="status-badge ${badgeClass}">${statusIcon} ${rec.status}</span>
      </div>
    `;

    container.appendChild(card);
  });
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
 * Master Data Cadangan (Fallback) 19 Kecamatan Kab. Gorontalo
 */
function getLocalFallbackMasterData() {
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

function getLocalFallbackMonitoring(filterKec, filterDesa) {
  const master = getLocalFallbackMasterData();
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
