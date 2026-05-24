const CACHE_TTL_MS = 60_000;
const cache = new Map();

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
      return json.rates;
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const base = (searchParams.get('base') || 'USD').toUpperCase();
  const targetsParam = searchParams.get('targets');
  const targets = targetsParam
    ? targetsParam.toUpperCase().split(',').map((t) => t.trim())
    : ['EUR', 'GBP', 'JPY', 'INR', 'CAD'];

  if (!/^[A-Z]{3}$/.test(base)) {
    return Response.json({ error: 'Invalid base currency code.' }, { status: 400 });
  }

  try {
    const result = await getRates(base);

    const filteredRates = {};
    for (const t of targets) {
      if (result.rates[t] !== undefined) {
        filteredRates[t] = result.rates[t];
      }
    }

    return Response.json({
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
    return Response.json(
      {
        error: 'Unable to fetch exchange rates. Please try again shortly.',
        details: err.message,
      },
      { status: 503 }
    );
  }
}
