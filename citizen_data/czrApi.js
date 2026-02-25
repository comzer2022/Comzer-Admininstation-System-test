import crypto from 'node:crypto';
import fetch from 'node-fetch';

const BASE   = process.env.CZR_BASE;
const KEY    = process.env.CZR_KEY || 'casbot';
const SECRET = process.env.CZR_SECRET;

function sign(body) {
  const ts  = Math.floor(Date.now() / 1000);
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const h = crypto.createHmac('sha256', SECRET);
  h.update(`${ts}\n${raw}`);
  const sig = h.digest('base64');
  return { ts, sig, raw };
}

async function fetchWithRetry(url, init, { attempts = 5, baseDelay = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const status = res.status;
      const text = await res.text().catch(()=>'');
      if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
        lastErr = new Error(`HTTP ${status}: ${text}`);
      } else {
        throw new Error(`HTTP ${status}: ${text}`);
      }
    } catch (e) {
      lastErr = e;
    }
    const jitter = Math.floor(Math.random() * 300);
    const wait = baseDelay * Math.pow(2, i) + jitter;
    await new Promise(r => setTimeout(r, wait));
  }
  throw lastErr;
}

export async function upsertMember(payload) {
  const body = JSON.stringify(payload);
  const { ts, sig } = sign(body);
  const res = await fetchWithRetry(`${BASE}/wp-json/czr-bridge/v1/ledger/member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'CASBOT/1.0 (+Koyeb)',
      'X-CZR-Key': KEY,
      'X-CZR-Ts': String(ts),
      'X-CZR-Sign': sig,
    },
    body,
  });
  return res.json();
}
