/**
 * SIMAMBIL - Konfigurasi Endpoint REST API Google Apps Script
 * SOT: 05-API-SPEC.md
 */

// Ganti URL default ini dengan Web App URL hasil Deploy Google Apps Script Anda:
// Contoh: 'https://script.google.com/macros/s/AKfycbx.../exec'
const DEFAULT_GAS_API_URL = '';

const AppConfig = {
  /**
   * Mengambil URL Endpoint aktif (prioritas dari localStorage pengguna, fallback ke DEFAULT_GAS_API_URL)
   */
  getApiUrl: function () {
    const saved = localStorage.getItem('SIMAMBIL_API_URL');
    if (saved && saved.trim().startsWith('https://script.google.com')) {
      return saved.trim();
    }
    return DEFAULT_GAS_API_URL.trim();
  },

  /**
   * Menyimpan URL Endpoint baru ke localStorage
   */
  setApiUrl: function (url) {
    if (!url) {
      localStorage.removeItem('SIMAMBIL_API_URL');
      return;
    }
    localStorage.setItem('SIMAMBIL_API_URL', url.trim());
  },

  /**
   * Cek apakah API URL sudah dikonfigurasi
   */
  isConfigured: function () {
    const url = this.getApiUrl();
    return url && url.startsWith('https://script.google.com');
  }
};
