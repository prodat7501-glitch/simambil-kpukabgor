/**
 * Vercel Serverless Function Proxy (/api/gas)
 * Menghilangkan kendala CORS dan Redirect 302 dari Google Apps Script
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzNK5akeBt11xDA1Y9pqgs8xqc8xwUIJYhDREBNCl8bl0gMbLacvwlAFjnHtZnW-6vvMg/exec';

  try {
    if (req.method === 'GET') {
      const qParams = new URLSearchParams(req.query).toString();
      const targetUrl = qParams ? `${GAS_URL}?${qParams}` : GAS_URL;
      
      const response = await fetch(targetUrl, { redirect: 'follow' });
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const bodyPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
