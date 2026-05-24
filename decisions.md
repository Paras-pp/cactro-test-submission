# Engineering & Product Decisions

## Which APIs did you choose and why?

**Primary: ExchangeRate-API** (`https://api.exchangerate-api.com/v4/latest/{base}`)
- Completely free, no API key, no registration
- Fast (~200–400ms), wide currency coverage (160+)
- Stable domain, good uptime history
- Returns a simple flat `{ rates: { ... } }` object — easy to normalize

**Fallback: Frankfurter** (`https://api.frankfurter.app/latest?from={base}`)
- Backed by the European Central Bank (ECB) — authoritative source
- Free, no key, open-source project
- Slightly smaller coverage (~30 currencies) but covers all majors
- Structurally similar response format, trivial to normalize

Both were chosen because they require zero auth setup, meaning an evaluator can run this immediately without signing up for anything.

## What is the fallback strategy when an API fails?

**Linear waterfall:**

```
1. Try ExchangeRate-API (timeout: 5s)
   ↓ success → return data, cache it
   ↓ fail (timeout / HTTP error / network)
2. Try Frankfurter (timeout: 5s)
   ↓ success → return data, cache it
   ↓ fail
3. Return stale cache if available (with warning)
   ↓ no cache at all
4. Return HTTP 503 with friendly error message
```

A 5-second per-API timeout prevents one bad API from hanging the entire request. The total worst-case wait is ~10s before falling back to cache/error.

## How do you handle conflicting data from different sources?

**Primary source wins if available and fresh.** We do not compare rates across sources — that would add complexity for unclear user value on free-tier data. Frankfurter is only ever used when ExchangeRate-API fails outright, so they never return conflicting data in the same response.

The `source` field in the API response tells the client (and the user via the UI) exactly which upstream provided the data, so there's full transparency.

If I had more time: I'd compare rates from both APIs in the background and flag large deviations (e.g., >2%) as a data quality warning. But for a tracker — not a trading engine — primary-wins is the right pragmatic call.

## What does the user see when things fail or data is stale?

| State | What the user sees |
|---|---|
| Fresh data (< 60s) | Green "Live" dot in status bar |
| Slightly stale (60–180s) | Amber "Slightly stale" label |
| Stale (> 180s) | Red "Stale" label |
| Stale cache fallback (all APIs down) | Amber warning banner: "All live APIs failed. Showing last known rates." |
| No data at all (first load, total failure) | Full-screen error state with retry button — no crash, no empty blank page |

The UI never crashes or shows a raw error message. Users see enough to understand the data quality without being alarmed.

## Did you do anything to improve staleness?

Yes — two things:

1. **In-memory cache with 60s TTL**: Repeated requests within a minute return cached data instantly, which also means the `freshnessSeconds` counter accurately reflects wall-clock age, not just "just fetched."

2. **30-second frontend polling**: The React app re-fetches rates every 30 seconds automatically, so the displayed data is always at most ~90s old under normal conditions (30s poll interval + up to 60s cache TTL).

These two together give users a "fresh enough" experience without hammering free-tier APIs.

## What did you cut to ship in 60 minutes?

- **Historical rates / sparklines**: Would need a different API (Frankfurter supports it) and a chart library — too much UI complexity for the time budget.
- **Cross-source deviation check**: Both APIs are trustworthy for majors; reconciliation would add code without user-visible value.
- **Persistent cache (Redis/SQLite)**: In-memory cache is lost on server restart — acceptable for a demo, not for production.
- **Authentication / rate limiting**: No user accounts, no API key management. Not needed for the free-tier public API pattern shown.
- **More currency pairs**: Limited to 8 bases / 7 targets for clarity. The API supports 160+ currencies.
- **Significant figures for exotic pairs**: Some pairs (e.g., JPY) have different decimal conventions — handled with basic `toFixed` per currency, not a full ICU number formatter.

## What would you add with more time?

- **Persistent cache** (Redis or SQLite) so stale data survives server restarts
- **WebSocket push** instead of 30s polling — push only when rates change by >0.1%
- **Sparkline trend**: 24h price chart using Frankfurter historical endpoint
- **Cross-source sanity check**: Background comparison; flag >2% deviation as a data quality warning
- **More currencies**: Let users search/select from the full 160+ list
- **Rate alerts**: "Notify me when EUR/USD crosses 1.10" — high product value for free-tier fintech users
- **CI pipeline**: Lint + build check on every push

## Other product/engineering thoughts

**Free-tier users don't need perfection — they need trust.** The most important product decision here was making freshness state *visible* rather than hiding it. A "Slightly stale" label with a retry button is far better UX than silently showing 3-hour-old data. Users can calibrate their trust accordingly.

**No mocks, ever.** All data comes from real public APIs. This is critical for an assessment — it proves the integration actually works, and it means the evaluator sees the same thing the user would see.

**The Vite proxy** (`/api → localhost:3001`) means the frontend doesn't need a hardcoded backend URL. The evaluator starts both servers and the proxy wires them together — no CORS issues, no env var configuration needed.
