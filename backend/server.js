// stake.HTH.foundation — masternode dashboard backend.
// Read-only JSON-RPC proxy to a local HelpTheHomeless full node.
// Non-custodial: this server NEVER holds keys or funds. It only exposes
// safe, read-only masternode/network RPC calls to the static frontend.

const express = require('express');
const cors = require('cors');

const {
  PORT = 8710,
  RPC_URL = 'http://127.0.0.1:9998/',
  RPC_USER = 'hthrpc',
  RPC_PASSWORD = 'CHANGEME',
  // Comma-separated allowed CORS origins.
  CORS_ORIGINS = 'https://stake.hth.foundation,http://localhost:8080',
  CACHE_TTL_MS = 15000,
} = process.env;

const app = express();
const origins = CORS_ORIGINS.split(',').map((s) => s.trim());
app.use(cors({ origin: origins }));
app.disable('x-powered-by');

// --- tiny JSON-RPC client -------------------------------------------------
const auth = 'Basic ' + Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64');

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'stake', method, params }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON RPC reply: ${text.slice(0, 200)}`); }
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

// Best-effort: return null instead of throwing (one dead RPC shouldn't 500 the page).
const soft = (p) => p.catch((e) => { console.warn('rpc soft-fail:', e.message); return null; });

// --- 15s in-memory cache (protects the node from dashboard traffic) -------
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < Number(CACHE_TTL_MS)) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

// --- routes ---------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'stake.hth.foundation' }));

app.get('/api/network', async (_req, res) => {
  try {
    const data = await cached('network', async () => {
      const [count, blocks, info, sync, sporks, conns] = await Promise.all([
        soft(rpc('masternode', ['count'])),
        soft(rpc('getblockcount')),
        soft(rpc('getblockchaininfo')),
        soft(rpc('mnsync', ['status'])),
        soft(rpc('spork', ['show'])),
        soft(rpc('getconnectioncount')),
      ]);
      // ChainLocks spork (name differs across forks; match by substring).
      let chainlocks = null;
      if (sporks && typeof sporks === 'object') {
        const key = Object.keys(sporks).find((k) => /CHAINLOCK/i.test(k));
        if (key) chainlocks = sporks[key];
      }
      return {
        blocks: blocks ?? info?.blocks ?? null,
        difficulty: info?.difficulty ?? null,
        connections: conns ?? null,
        masternodes: count, // { total, enabled, ... }
        mnsync: sync ? { status: sync.AssetName || sync.assetName, done: !!sync.IsSynced } : null,
        chainlocksSpork: chainlocks,
      };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Normalize masternodelist into an array the frontend can render.
function normalizeMnList(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([outpoint, v]) => {
    if (v && typeof v === 'object') {
      return {
        outpoint,
        status: v.status ?? v.state ?? null,
        address: v.address ?? null,
        payee: v.payee ?? null,
        lastPaidTime: v.lastpaidtime ?? null,
        lastPaidBlock: v.lastpaidblock ?? null,
        activeSeconds: v.activeseconds ?? null,
        proTxHash: v.proTxHash ?? null,
      };
    }
    // legacy "full" mode returns a single string: "<status> <protocol> <payee> <lastseen> <activeseconds> ..."
    const p = String(v).trim().split(/\s+/);
    return { outpoint, status: p[0] ?? null, payee: p[2] ?? null, activeSeconds: Number(p[4]) || null };
  });
}

app.get('/api/masternodes', async (_req, res) => {
  try {
    const list = await cached('mnlist', async () => {
      const map = await rpc('masternodelist', ['json']).catch(() => rpc('masternodelist', ['full']));
      return normalizeMnList(map);
    });
    const enabled = list.filter((m) => /ENABLED/i.test(m.status || '')).length;
    res.json({ total: list.length, enabled, masternodes: list });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Look up a single masternode by collateral outpoint (txid-index) or IP address.
app.get('/api/masternode/:key', async (req, res) => {
  try {
    const key = req.params.key.toLowerCase();
    const { masternodes } = await cached('mnlist_full', async () => {
      const map = await rpc('masternodelist', ['json']).catch(() => rpc('masternodelist', ['full']));
      return { masternodes: normalizeMnList(map) };
    });
    const hit = masternodes.find(
      (m) => m.outpoint.toLowerCase().startsWith(key) ||
             (m.address && m.address.toLowerCase().includes(key)) ||
             (m.payee && m.payee.toLowerCase() === key)
    );
    if (!hit) return res.status(404).json({ error: 'masternode not found', key });
    res.json(hit);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(Number(PORT), () => {
  console.log(`stake.HTH.foundation backend on :${PORT} -> ${RPC_URL}`);
  console.log(`CORS origins: ${origins.join(', ')}`);
});
