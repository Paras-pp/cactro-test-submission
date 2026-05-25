# ForexTracker — Real-Time Currency Exchange Tracker

A full-stack currency exchange rate tracker built for the fintech assessment.
Shows live rates with freshness indicators, graceful fallbacks, and transparent data sourcing.

**Live demo:** https://frontend-five-steel-70.vercel.app

---

## Initial Thought Process

The prompt said "real-time data aggregation service" — but real-time is expensive and complex.
Free-tier users don't need tick-level precision; they need data that feels **reliable**, is **fresh enough**,
and is **transparent about its state**. So the core product bet was: make data freshness visible and trust-worthy,
not just technically "live."

Two free public APIs with no auth required → zero setup friction for evaluators and users.
In-memory cache + 30-second polling = fresh enough without hammering free-tier limits.
The UI prominently shows source, age, and a freshness label — users can judge data quality themselves.

## Product Approach

- **Freshness over raw speed**: A 60s cache with a visible "Slightly stale" label beats silently serving stale data.
- **Graceful degradation**: The UI never crashes. When all APIs fail, it shows the last known rates with a clear warning.
- **Transparency**: Every rate card response includes `source`, `fetchedAt`, `cacheStatus`, and `freshness`.
- **No over-engineering**: No database, no auth, no message queue. In-memory cache is the right complexity for this scope.

---

## Project Structure

```
/
├── decisions.md       # Engineering & product decision log
├── README.md
├── .gitignore
├── backend/
│   ├── package.json
│   ├── server.js      # Express API with caching, fallback, timeout
│   └── node_modules/
└── frontend/
    ├── package.json
    ├── vite.config.js  # Proxies /api → localhost:3001
    ├── index.html
    └── src/
        ├── App.jsx     # Main currency dashboard component
        ├── App.css
        ├── index.css
        └── main.jsx
```

---

## Setup

**Requirements:** Node.js 18+ and npm.

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies
cd ../frontend
npm install
```

---

## Running the App

**Terminal 1 — Backend:**

```bash
cd backend
npm start
# Server starts on http://localhost:3001
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
# Opens on http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

---

## API Endpoint

### `GET /api/rates`

**Query parameters:**
| Param | Default | Description |
|---|---|---|
| `base` | `USD` | Base currency (3-letter ISO code) |
| `targets` | `EUR,GBP,JPY,INR,CAD` | Comma-separated target currencies |

**Example:**
```
GET http://localhost:3001/api/rates?base=USD&targets=EUR,GBP,JPY,INR,CAD
```

**Example response:**
```json
{
  "base": "USD",
  "rates": {
    "EUR": 0.862,
    "GBP": 0.745,
    "JPY": 159.12,
    "INR": 95.88,
    "CAD": 1.38
  },
  "source": "exchangerate-api",
  "fetchedAt": "2026-05-24T07:00:00.000Z",
  "cacheStatus": "miss",
  "freshnessSeconds": 0,
  "freshness": "fresh"
}
```

**Cached response (subsequent request within 60s):**
```json
{
  "base": "USD",
  "rates": { "EUR": 0.862, "GBP": 0.745 },
  "source": "exchangerate-api",
  "fetchedAt": "2026-05-24T07:00:00.000Z",
  "cacheStatus": "hit",
  "freshnessSeconds": 23,
  "freshness": "fresh"
}
```

**Degraded state (all APIs failed, stale cache served):**
```json
{
  "cacheStatus": "stale_fallback",
  "freshness": "stale",
  "warning": "All live APIs failed. Showing last known rates.",
  ...
}
```

### `GET /health`
```json
{ "status": "ok" }
```

---

## Data Sources

| Priority | Source | URL | Notes |
|---|---|---|---|
| 1 (Primary) | ExchangeRate-API | `api.exchangerate-api.com` | Free, no key, 160+ currencies |
| 2 (Fallback) | Frankfurter (ECB) | `api.frankfurter.app` | Free, no key, ~30 currencies |

---

## Freshness Labels

| Label | Age | Color |
|---|---|---|
| Live | < 60s | Green |
| Slightly stale | 60–180s | Amber |
| Stale | > 180s | Red |

---

## Known Limitations

1. **In-memory cache only** — server restart clears the cache. Under load or after restart, the next request re-fetches live.
2. **Frankfurter covers ~30 currencies** — if the primary API fails and the user requests an exotic pair, it may return an incomplete rate set.
3. **No user authentication** — this is a public read-only service. Production would need rate limiting and API key management.
4. **30s polling is client-side** — if the browser tab is backgrounded, some browsers throttle timers; rates may refresh less frequently.
5. **No persistent historical data** — all rates are point-in-time snapshots. Sparklines / trend charts would require a separate storage layer.
