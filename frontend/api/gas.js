/**
 * Vercel Serverless Function Proxy (/api/gas)
 * Menghilangkan kendala CORS dan Redirect 302 dari Google Apps Script
 * Dilengkapi proteksi CORS domain KPU dan Shared Auth Token
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzNK5akeBt11xDA1Y9pqgs8xqc8xwUIJYhDREBNCl8bl0gMbLacvwlAFjnHtZnW-6vvMg/exec';
const API_AUTH_TOKEN = 'SIMAMBIL_KABGOR_2024_SECURE_TOKEN';

export default async function handler(req, res) {
  // 1. CORS Headers & Origin Restriction (VULN-06)
  const origin = req.headers.origin || '';
  const isAllowedOrigin = !origin ||
    origin.includes('simambil-kabgor.vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');

  if (isAllowedOrigin && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    return res.status(403).json({ status: 'error', message: 'Akses Ditolak: Origin tidak diizinkan.' });
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Date, X-Api-Version, X-SIMAMBIL-TOKEN'
  );
  // Disable caching agar respon monitoring dan master data selalu real-time
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 2. HTTP GET Forwarding dengan Injeksi Token Otentikasi (VULN-01)
    if (req.method === 'GET') {
      const queryObj = { ...req.query };
      if (!queryObj.token) {
        queryObj.token = API_AUTH_TOKEN;
      }
      const qParams = new URLSearchParams(queryObj).toString();
      const targetUrl = qParams ? `${GAS_URL}?${qParams}` : GAS_URL;
      
      const response = await fetch(targetUrl, { redirect: 'follow' });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 3. HTTP POST Forwarding dengan Injeksi Token Otentikasi (VULN-01)
    if (req.method === 'POST') {
      let bodyObj = req.body;
      if (typeof bodyObj === 'string') {
        try {
          bodyObj = JSON.parse(bodyObj);
        } catch (e) {
          bodyObj = {};
        }
      }
      if (typeof bodyObj === 'object' && bodyObj !== null) {
        if (!bodyObj.token) {
          bodyObj.token = API_AUTH_TOKEN;
        }
      }

      const bodyPayload = JSON.stringify(bodyObj);
      const response = await fetch(GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: bodyPayload
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Proxy Error to Google Apps Script: ' + error.message
    });
  }
}
