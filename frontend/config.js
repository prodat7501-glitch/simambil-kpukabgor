/**
 * SIMAMBIL - Konfigurasi Endpoint REST API Google Apps Script
 * SOT: 05-API-SPEC.md
 */

// URL Langsung ke Web App Google Apps Script
const DIRECT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzNK5akeBt11xDA1Y9pqgs8xqc8xwUIJYhDREBNCl8bl0gMbLacvwlAFjnHtZnW-6vvMg/exec';

// Token Otentikasi Keamanan SIMAMBIL (VULN-01)
const API_AUTH_TOKEN = 'SIMAMBIL_KABGOR_2024_SECURE_TOKEN';

const AppConfig = {
  /**
   * Mengambil Token Otentikasi
   */
  getAuthToken: function () {
    return API_AUTH_TOKEN;
  },

  /**
   * Mengambil URL Endpoint aktif.
   * - Prioritas 1: URL custom tersimpan di localStorage pengguna
   * - Prioritas 2: Endpoint Proxy Serverless internal (/api/gas) jika berjalan di Vercel (Bebas CORS)
   * - Prioritas 3: URL Direct Apps Script
   */
  getApiUrl: function () {
    const saved = localStorage.getItem('SIMAMBIL_API_URL');
    if (saved && saved.trim()) {
      return saved.trim();
    }
    
    // Jika dibuka di domain Vercel, utamakan serverless proxy internal agar 100% bebas hambatan CORS
    if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
      return '/api/gas';
    }

    return DIRECT_GAS_URL;
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
    return !!(url && (url.startsWith('https://script.google.com') || url.startsWith('/api/')));
  }
};
