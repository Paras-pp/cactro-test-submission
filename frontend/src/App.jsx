import { useState, useEffect, useCallback } from 'react';
import './App.css';

const DEFAULT_BASE = 'USD';
const DEFAULT_TARGETS = ['EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF'];
const SUPPORTED_BASES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD'];
const POLL_INTERVAL_MS = 30_000;

const CURRENCY_NAMES = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  INR: 'Indian Rupee',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  CHF: 'Swiss Franc',
};

const CURRENCY_FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  INR: '🇮🇳', CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭',
};

function freshnessConfig(label) {
  switch (label) {
    case 'fresh':          return { cls: 'fresh',         dot: '●', text: 'Live' };
    case 'slightly_stale': return { cls: 'slightly-stale', dot: '●', text: 'Slightly stale' };
    case 'stale':          return { cls: 'stale',          dot: '●', text: 'Stale' };
    default:               return { cls: 'unknown',        dot: '○', text: 'Unknown' };
  }
}

function formatRate(rate, target) {
  if (target === 'JPY') return rate.toFixed(2);
  if (rate >= 100) return rate.toFixed(2);
  return rate.toFixed(4);
}

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function RateCard({ currency, rate, base }) {
  return (
    <div className="rate-card">
      <div className="rate-card-header">
        <span className="flag">{CURRENCY_FLAGS[currency] || '🏳'}</span>
        <div>
          <div className="currency-code">{currency}</div>
          <div className="currency-name">{CURRENCY_NAMES[currency] || currency}</div>
        </div>
      </div>
      <div className="rate-value">{formatRate(rate, currency)}</div>
      <div className="rate-label">1 {base} = {formatRate(rate, currency)} {currency}</div>
    </div>
  );
}

function StatusBar({ data }) {
  if (!data) return null;
  const fc = freshnessConfig(data.freshness);
  const sourceLabel = data.source === 'exchangerate-api'
    ? 'ExchangeRate-API'
    : data.source === 'frankfurter'
    ? 'Frankfurter (ECB)'
    : data.source;

  return (
    <div className={`status-bar ${fc.cls}`}>
      <span className="freshness-dot" title={fc.text}>{fc.dot}</span>
      <span className="freshness-label">{fc.text}</span>
      <span className="status-sep">·</span>
      <span>Source: <strong>{sourceLabel}</strong></span>
      <span className="status-sep">·</span>
      <span>Updated {timeAgo(data.fetchedAt)}</span>
      {data.cacheStatus === 'hit' && (
        <>
          <span className="status-sep">·</span>
          <span className="cache-badge">Cached ({data.freshnessSeconds}s)</span>
        </>
      )}
    </div>
  );
}

function WarningBanner({ message }) {
  if (!message) return null;
  return (
    <div className="warning-banner">
      <span>⚠</span> {message}
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="error-state">
      <div className="error-icon">⚡</div>
      <h2>Rates temporarily unavailable</h2>
      <p>Our data sources are taking a breather. This is usually brief.</p>
      <button onClick={onRetry} className="retry-btn">Retry</button>
    </div>
  );
}

export default function App() {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchAttempt, setLastFetchAttempt] = useState(null);

  const fetchRates = useCallback(async () => {
    setError(null);
    setLoading((prev) => prev || true);
    setLastFetchAttempt(new Date());
    try {
      const targets = DEFAULT_TARGETS.filter((t) => t !== base).join(',');
      const res = await fetch(`/api/rates?base=${base}&targets=${targets}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    fetchRates();
    const interval = setInterval(fetchRates, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRates]);

  const handleBaseChange = (e) => {
    setBase(e.target.value);
  };

  const rates = data?.rates ? Object.entries(data.rates) : [];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-area">
            <span className="logo-icon">💱</span>
            <div>
              <h1>ForexTracker</h1>
              <p className="tagline">Real-time currency exchange rates</p>
            </div>
          </div>
          <div className="controls">
            <label htmlFor="base-select">Base currency</label>
            <select id="base-select" value={base} onChange={handleBaseChange}>
              {SUPPORTED_BASES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_FLAGS[c]} {c} — {CURRENCY_NAMES[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="main-content">
        {data?.warning && <WarningBanner message={data.warning} />}

        <StatusBar data={data} />

        {loading && !data && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Fetching live rates…</p>
          </div>
        )}

        {!loading && error && !data && <ErrorState onRetry={fetchRates} />}

        {rates.length > 0 && (
          <div className="rates-grid">
            {rates.map(([currency, rate]) => (
              <RateCard key={currency} currency={currency} rate={rate} base={base} />
            ))}
          </div>
        )}

        {loading && data && (
          <div className="refresh-indicator">Refreshing…</div>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Rates auto-refresh every 30s · Free-tier public APIs ·
          Not financial advice
        </p>
      </footer>
    </div>
  );
}
