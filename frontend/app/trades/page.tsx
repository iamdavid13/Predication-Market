'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import { getApiBaseUrl } from '../../lib/api';

interface Trade {
  id: string;
  market: string;
  market_id: string;
  image_url: string;
  trader: string;
  trader_address: string;
  profile_url: string;
  side: 'buy' | 'sell';
  outcome: string;
  value: number;
  price: number;
  price_dollars: number;
  shares: number;
  exchange: string;
  trade_time: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  trades: Trade[];
  timestamp: string;
  error?: string;
}

type SortKey = 'trade_time' | 'trader' | 'side' | 'market' | 'outcome' | 'value' | 'price' | 'shares';
type SortDir = 'asc' | 'desc';
type ExchangeFilter = 'all' | 'kalshi' | 'polymarket';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function timeAgo(value: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface WsStats {
  enabled: boolean;
  connected: boolean;
  total_trades: number;
  buffer_size: number;
  reconnects: number;
  tickers_cached?: number;
  tokens_cached?: number;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('trade_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [ticker, setTicker] = useState<Trade[]>([]);
  const [pollMs, setPollMs] = useState<number>(5000);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('all');
  const [sseConnected, setSseConnected] = useState(false);
  const [kalshiWs, setKalshiWs] = useState<WsStats | null>(null);
  const [polyWs, setPolyWs] = useState<WsStats | null>(null);
  const latestTradesRef = useRef<Trade[]>([]);
  const tickerIdsRef = useRef<Set<string>>(new Set());
  const apiBaseUrl = getApiBaseUrl();

  const fetchTrades = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/trades?limit=100`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        const prevTrades = latestTradesRef.current;
        const prevIds = new Set(prevTrades.map(t => t.id));
        const fresh = data.trades.filter(t => !prevIds.has(t.id));

        if (fresh.length && !sseConnected) {
          setTicker(current => {
            const merged = [...fresh, ...current];
            return merged.slice(0, 30);
          });
        }

        latestTradesRef.current = data.trades;
        setTrades(data.trades);
        setLastUpdated(new Date().toISOString());
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch trades');
      }
    } catch {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, sseConnected]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  useEffect(() => {
    const interval = setInterval(fetchTrades, pollMs);
    return () => clearInterval(interval);
  }, [fetchTrades, pollMs]);

  // SSE: real-time trade stream
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${apiBaseUrl}/api/trades/stream?limit=20`);
      es.onopen = () => setSseConnected(true);
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const incoming: Trade[] = payload.trades || [];
          if (incoming.length) {
            setTicker(current => {
              const fresh = incoming.filter(t => !tickerIdsRef.current.has(t.id));
              for (const t of fresh) tickerIdsRef.current.add(t.id);
              // cap id set
              if (tickerIdsRef.current.size > 3000) tickerIdsRef.current.clear();
              if (!fresh.length) return current;
              return [...fresh, ...current].slice(0, 40);
            });
            setLastUpdated(new Date().toISOString());
          }
        } catch { /* ignore malformed */ }
      };
      es.onerror = () => setSseConnected(false);
    } catch {
      setSseConnected(false);
    }
    return () => { es?.close(); setSseConnected(false); };
  }, [apiBaseUrl]);

  // Fetch WS stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/stats`);
        const data = await res.json();
        if (data.success) {
          if (data.kalshi_ws) setKalshiWs(data.kalshi_ws);
          if (data.poly_ws) setPolyWs(data.poly_ws);
        }
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'market' || key === 'trader' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const rows = useMemo(() => {
    const filtered = exchangeFilter === 'all'
      ? trades
      : trades.filter(t => t.exchange.toLowerCase() === exchangeFilter);
    const list = [...filtered];
    return list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'trade_time': return dir * a.trade_time.localeCompare(b.trade_time);
        case 'trader': return dir * a.trader.localeCompare(b.trader);
        case 'side': return dir * a.side.localeCompare(b.side);
        case 'market': return dir * a.market.localeCompare(b.market);
        case 'outcome': return dir * a.outcome.localeCompare(b.outcome);
        case 'value': return dir * (a.value - b.value);
        case 'price': return dir * (a.price_dollars - b.price_dollars);
        case 'shares': return dir * (a.shares - b.shares);
        default: return 0;
      }
    });
  }, [trades, sortKey, sortDir, exchangeFilter]);

  const maxValue = Math.max(...rows.map(t => t.value), 1);
  const maxPrice = Math.max(...rows.map(t => t.price_dollars), 1);
  const maxShares = Math.max(...rows.map(t => t.shares), 1);
  const kalshiCount = trades.filter(t => t.exchange.toLowerCase() === 'kalshi').length;
  const polymarketCount = trades.filter(t => t.exchange.toLowerCase() === 'polymarket').length;
  const lastUpdatedDisplay = lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '...';

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      <div className="max-w-[1920px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold">Browse all trades across Polymarket & Kalshi</h1>

        {/* Live ticker */}
        <div className="mt-4 border border-[#1f1f1f] rounded-xl bg-gradient-to-r from-[#0d0d14] via-[#0e0e12] to-[#0b0b18] p-4 shadow-lg shadow-black/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#111827] border border-[#1f2937] text-xs uppercase tracking-wide text-gray-300">
                <span className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-green-400 animate-pulse' : ticker.length ? 'bg-yellow-400 animate-pulse' : 'bg-gray-500'}`} />
                {sseConnected ? 'Live stream' : 'Polling'}
              </div>
              <p className="text-sm text-gray-400">{sseConnected ? 'SSE connected - streaming real-time trades' : `Polling every ${Math.round(pollMs / 1000)}s`}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 text-gray-400">
                <span>Refresh</span>
                <select
                  value={pollMs}
                  onChange={e => setPollMs(Number(e.target.value))}
                  className="bg-[#0b0b0f] border border-[#1f1f1f] rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={5000}>5s</option>
                  <option value={15000}>15s</option>
                  <option value={30000}>30s</option>
                </select>
              </label>
              <button
                onClick={fetchTrades}
                className="px-3 py-1.5 rounded-md border border-[#2a2a2a] bg-[#121212] text-gray-200 hover:border-gray-400 hover:text-white transition-colors"
              >
                Refresh now
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="px-2 py-1 rounded-md bg-[#101018] border border-[#1f1f1f]">Last sync {lastUpdatedDisplay}</span>
            <span className="px-2 py-1 rounded-md bg-[#101018] border border-[#1f1f1f]">Kalshi: {kalshiCount}</span>
            <span className="px-2 py-1 rounded-md bg-[#101018] border border-[#1f1f1f]">Polymarket: {polymarketCount}</span>

            {/* Kalshi Live button */}
            {kalshiWs && (
              <span className={`px-3 py-1.5 rounded-full border font-semibold flex items-center gap-1.5 transition-colors ${
                kalshiWs.connected
                  ? 'bg-green-900/20 border-green-700/40 text-green-400'
                  : 'bg-red-900/20 border-red-700/40 text-red-400'
              }`}>
                <span className={`h-2 w-2 rounded-full ${kalshiWs.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                Kalshi Live
                <span className="font-normal text-gray-400 ml-1">{kalshiWs.total_trades.toLocaleString()}</span>
              </span>
            )}

            {/* Polymarket Live button */}
            {polyWs && (
              <span className={`px-3 py-1.5 rounded-full border font-semibold flex items-center gap-1.5 transition-colors ${
                polyWs.connected
                  ? 'bg-blue-900/20 border-blue-700/40 text-blue-400'
                  : 'bg-red-900/20 border-red-700/40 text-red-400'
              }`}>
                <span className={`h-2 w-2 rounded-full ${polyWs.connected ? 'bg-blue-400 animate-pulse' : 'bg-red-400'}`} />
                Polymarket Live
                <span className="font-normal text-gray-400 ml-1">{polyWs.total_trades.toLocaleString()}</span>
              </span>
            )}
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {ticker.length === 0 ? (
              <div className="text-sm text-gray-500 px-2">Waiting for fresh fills...</div>
            ) : (
              ticker.map(trade => (
                <div
                  key={`${trade.id}-ticker`}
                  className="min-w-[280px] max-w-sm bg-[#111111] border border-[#1f1f1f] rounded-lg px-4 py-3 flex flex-col gap-2 shadow-md shadow-black/30"
                >
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{timeAgo(trade.trade_time)}</span>
                    <span className="uppercase tracking-wide text-[11px] text-gray-500">{trade.exchange}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold border ${
                      trade.side === 'buy'
                        ? 'text-green-300 border-green-900 bg-green-900/20'
                        : 'text-red-300 border-red-900 bg-red-900/20'
                    }`}>
                      {trade.side.toUpperCase()}
                    </span>
                    <span className="text-sm text-white font-semibold line-clamp-1">{trade.market}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-300">
                    <span className="font-medium">{trade.outcome}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">{trade.shares.toFixed(0)} shr</span>
                      <span className="text-gray-400">@ {formatPrice(trade.price_dollars)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white font-semibold">{formatCurrency(trade.value)}</span>
                    {trade.trader && (
                      <span className="text-xs text-blue-400 line-clamp-1" title={trade.trader}>{trade.trader}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-3 mt-4">
          <button className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-white">Trades</button>
          <button className="px-4 py-2 rounded-lg bg-[#111111] border border-[#2a2a2a] text-sm text-gray-400">Positions</button>
          <button className="px-4 py-2 rounded-lg bg-[#111111] border border-[#2a2a2a] text-sm text-gray-400">Deposits/Withdrawals <span className="text-xs bg-blue-700/30 border border-blue-900 text-blue-300 px-2 py-0.5 rounded ml-2">Beta</span></button>
        </div>

        {/* Exchange filter */}
        <div className="flex items-center gap-3 mt-6">
          <span className="text-sm text-gray-400">Show:</span>
          {(['all', 'kalshi', 'polymarket'] as ExchangeFilter[]).map(opt => {
            const active = exchangeFilter === opt;
            const label = opt === 'all' ? 'All' : opt === 'kalshi' ? 'Kalshi' : 'Polymarket';
            return (
              <button
                key={opt}
                onClick={() => setExchangeFilter(opt)}
                className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  active
                    ? 'border-blue-500 text-white bg-blue-600/20'
                    : 'border-[#2a2a2a] text-gray-300 hover:border-gray-500'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-6">
          <button className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <span>Show Trader Tags</span>
            <div className="relative w-10 h-5 rounded-full bg-[#2a2a2a]">
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white"></div>
            </div>
          </label>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-900/20 border border-red-900 rounded-lg p-6 text-center">
            <p className="text-red-400">⚠️ {error}</p>
            <button onClick={fetchTrades} className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th onClick={() => toggleSort('trade_time')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Trade Time{sortArrow('trade_time')}</th>
                  <th onClick={() => toggleSort('trader')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Trader{sortArrow('trader')}</th>
                  <th onClick={() => toggleSort('side')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Side{sortArrow('side')}</th>
                  <th onClick={() => toggleSort('market')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Market{sortArrow('market')}</th>
                  <th onClick={() => toggleSort('outcome')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Outcome{sortArrow('outcome')}</th>
                  <th onClick={() => toggleSort('value')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Value{sortArrow('value')}</th>
                  <th onClick={() => toggleSort('price')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Price{sortArrow('price')}</th>
                  <th onClick={() => toggleSort('shares')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Shares{sortArrow('shares')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">No trades found</td>
                  </tr>
                ) : (
                  rows.map(trade => (
                    <tr key={trade.id} className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                        {formatTime(trade.trade_time)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {trade.profile_url ? (
                          <a
                            href={trade.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                          >
                            {trade.trader}
                          </a>
                        ) : (
                          <span className="text-blue-400">{trade.trader}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
                          trade.side === 'buy'
                            ? 'text-green-400 border-green-900 bg-green-900/20'
                            : 'text-red-400 border-red-900 bg-red-900/20'
                        }`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {trade.image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={trade.image_url} alt="" className="w-7 h-7 rounded-full object-cover border border-[#2a2a2a]" />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-[#2a2a2a]" />
                          )}
                          <span className="text-sm text-white line-clamp-2">{trade.market}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-300">
                        {trade.outcome}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm text-white">{formatCurrency(trade.value)}</span>
                          <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${Math.max((trade.value / maxValue) * 100, 3)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm text-white">{formatPrice(trade.price_dollars)}</span>
                          <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${Math.max((trade.price_dollars / maxPrice) * 100, 3)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm text-white">{trade.shares.toFixed(0)}</span>
                          <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                            <div className="h-full bg-gray-300" style={{ width: `${Math.max((trade.shares / maxShares) * 100, 3)}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
