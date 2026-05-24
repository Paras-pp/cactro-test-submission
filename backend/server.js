import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─── In-memory cache ────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map(); // key: base currency → { data, fetchedAt }

// ─── API definitions ────────────────────────────────────────────────────────
const APIS = [
  {
    name: 'exchangerate-api',
    fetch: async (base) => {
      const res = await fetchWithTimeout(
        `https://api.exchangerate-api.com/v4/latest/${base}`,
        5000
      );
      if (!res.ok) throw new Error(`exchangerate-api HTTP ${res.status}`);
      const json = await res.json();
      return json.rates; // { EUR: 0.91, GBP: 0.79, ... }
    },
  },
  {
    name: 'frankfurter',
    fetch: async (base) => {
      const res = await fetchWithTimeout(
        `https://api.frankfurter.app/latest?from=${base}`,
        5000
      );
      if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
      const json = await res.json();
      return json.rates;
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function freshnessLabel(seconds) {
  if (seconds < 60) return 'fresh';
  if (seconds < 180) return 'slightly_stale';
  return 'stale';
}

// ─── Core rate-fetching logic ────────────────────────────────────────────────
async function getRates(base) {
  const cacheKey = base.toUpperCase();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const freshnessSeconds = Math.floor((now - cached.fetchedAt) / 1000);
    return {
      ...cached.data,
      cacheStatus: 'hit',
      freshnessSeconds,
      freshness: freshnessLabel(freshnessSeconds),
    };
  }

  // Try each API in order; first success wins
  let lastError;
  for (const api of APIS) {
    try {
      const rates = await api.fetch(base);
      const payload = {
        base: cacheKey,
        rates,
        source: api.name,
        fetchedAt: new Date().toISOString(),
      };
      cache.set(cacheKey, { data: payload, fetchedAt: now });
      return {
        ...payload,
        cacheStatus: 'miss',
        freshnessSeconds: 0,
        freshness: 'fresh',
      };
    } catch (err) {
      lastError = err;
      console.warn(`[${api.name}] failed: ${err.message}`);
    }
  }

  // All APIs failed — return stale cache if available
  if (cached) {
    const freshnessSeconds = Math.floor((now - cached.fetchedAt) / 1000);
    return {
      ...cached.data,
      cacheStatus: 'stale_fallback',
      freshnessSeconds,
      freshness: freshnessLabel(freshnessSeconds),
      warning: 'All live APIs failed. Showing last known rates.',
    };
  }

  throw new Error(`All APIs failed: ${lastError?.message}`);
}

// ─── Route ───────────────────────────────────────────────────────────────────
/**
 * GET /api/rates?base=USD&targets=EUR,GBP,JPY,INR,CAD
 * Returns normalized rate object with metadata.
 */
app.get('/api/rates', async (req, res) => {
  const base = (req.query.base || 'USD').toUpperCase();
  const targets = req.query.targets
    ? req.query.targets.toUpperCase().split(',').map((t) => t.trim())
    : ['EUR', 'GBP', 'JPY', 'INR', 'CAD'];

  // Basic validation
  if (!/^[A-Z]{3}$/.test(base)) {
    return res.status(400).json({ error: 'Invalid base currency code.' });
  }

  try {
    const result = await getRates(base);

    // Filter to requested targets only
    const filteredRates = {};
    for (const t of targets) {
      if (result.rates[t] !== undefined) {
        filteredRates[t] = result.rates[t];
      }
    }

    return res.json({
      base: result.base,
      rates: filteredRates,
      source: result.source,
      fetchedAt: result.fetchedAt,
      cacheStatus: result.cacheStatus,
      freshnessSeconds: result.freshnessSeconds,
      freshness: result.freshness,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (err) {
    console.error('[/api/rates] Error:', err.message);
    return res.status(503).json({
      error: 'Unable to fetch exchange rates. Please try again shortly.',
      details: err.message,
    });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Forex backend running on http://localhost:${PORT}`);
});
