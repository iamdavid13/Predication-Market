'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navbar from '../../components/Navbar';
import { getApiBaseUrl } from '../../lib/api';

interface Insider {
  first_trade: string;
  first_trade_iso: string;
  since_days: number;
  market: string;
  image_url: string;
  outcome: 'Yes' | 'No';
  z_score: number;
  invested_usd: number;
  avg_price: number;
  current_price: number;
  pnl_dollar: number;
  pnl_percent: number;
  positions: number;
  wallet_age_at_trade: number;
  user: string;
  user_color: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  insiders: Insider[];
  timestamp: string;
  error?: string;
}

type SortKey = 'first_trade' | 'since_days' | 'market' | 'outcome' | 'z_score' | 'invested_usd' | 'avg_price' | 'current_price' | 'pnl' | 'positions' | 'wallet_age_at_trade' | 'user';
type SortDir = 'asc' | 'desc';

// Deterministic bright badge colors for user chips
const USER_COLORS = [
  '#4cc9ff', '#ff4d6d', '#7dd3fc', '#a855f7', '#f97316', '#facc15', '#34d399', '#22d3ee', '#f472b6', '#c084fc', '#fb7185', '#38bdf8', '#bef264'
];

function pickUserColor(user: string): string {
  if (!user) return USER_COLORS[0];
  const hash = user.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPrice(value: number): string {
  return `${value.toFixed(1)}¢`;
}

function formatPnl(insider: Insider): string {
  const pct = insider.pnl_percent;
  const sign = pct >= 0 ? '+' : '';
  return `${formatCurrency(insider.pnl_dollar)} (${sign}${pct.toFixed(2)}%)`;
}

export default function InsidersPage() {
  const [insiders, setInsiders] = useState<Insider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('z_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [maxDays, setMaxDays] = useState<number>(7);
  const [includeBots, setIncludeBots] = useState(false);
  const apiBaseUrl = getApiBaseUrl();

  const fetchInsiders = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/insiders?max_days_ago=${maxDays}&include_bots=${includeBots}&limit=80`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        setInsiders(data.insiders);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch insider activity');
      }
    } catch {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, maxDays, includeBots]);

  useEffect(() => {
    setLoading(true);
    fetchInsiders();
    const interval = setInterval(fetchInsiders, 60000);
    return () => clearInterval(interval);
  }, [fetchInsiders]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'market' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const rows = useMemo(() => {
    const list = [...insiders];
    return list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'first_trade': return dir * a.first_trade.localeCompare(b.first_trade);
        case 'since_days': return dir * (a.since_days - b.since_days);
        case 'market': return dir * a.market.localeCompare(b.market);
        case 'outcome': return dir * a.outcome.localeCompare(b.outcome);
        case 'z_score': return dir * (a.z_score - b.z_score);
        case 'invested_usd': return dir * (a.invested_usd - b.invested_usd);
        case 'avg_price': return dir * (a.avg_price - b.avg_price);
        case 'current_price': return dir * (a.current_price - b.current_price);
        case 'pnl': return dir * (a.pnl_dollar - b.pnl_dollar);
        case 'positions': return dir * (a.positions - b.positions);
        case 'wallet_age_at_trade': return dir * (a.wallet_age_at_trade - b.wallet_age_at_trade);
        case 'user': return dir * a.user.localeCompare(b.user);
        default: return 0;
      }
    });
  }, [insiders, sortKey, sortDir]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      <div className="max-w-[1920px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold">Potential Insiders on Polymarket</h1>
        <p className="text-sm text-gray-400 mt-2 max-w-5xl">
          This table highlights traders whose activity appears unusual. These traders often enter at low prices, make very large trades, have little account history, and rarely trade other markets. A high Z-Score means the position is much larger than average for that market. While this activity can suggest unusually strong conviction or possible insider knowledge, it is only a signal, not proof.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mt-6">
          {/* Centered time window buttons */}
          <div className="mx-auto flex items-center gap-2 bg-[#111111] border border-[#2a2a2a] rounded-lg px-2 py-2">
            {[
              { label: '7 days', value: 7 },
              { label: '30 days', value: 30 },
              { label: '90 days', value: 90 },
              { label: '1 year', value: 365 },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setMaxDays(item.value)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  maxDays === item.value
                    ? 'bg-[#1f1f1f] text-white border border-[#3a3a3a]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <span>Include Bots</span>
              <button
                onClick={() => setIncludeBots(!includeBots)}
                className={`relative w-10 h-5 rounded-full transition-colors ${includeBots ? 'bg-green-600' : 'bg-[#2a2a2a]'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${includeBots ? 'translate-x-5' : ''}`} />
              </button>
            </label>
          </div>
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
            <button onClick={fetchInsiders} className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors">
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
                  <th onClick={() => toggleSort('first_trade')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">First Trade{sortArrow('first_trade')}</th>
                  <th onClick={() => toggleSort('since_days')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Since{sortArrow('since_days')}</th>
                  <th onClick={() => toggleSort('market')} className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Market{sortArrow('market')}</th>
                  <th onClick={() => toggleSort('outcome')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Outcome{sortArrow('outcome')}</th>
                  <th onClick={() => toggleSort('z_score')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Z-Score{sortArrow('z_score')}</th>
                  <th onClick={() => toggleSort('invested_usd')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Invested (USD){sortArrow('invested_usd')}</th>
                  <th onClick={() => toggleSort('avg_price')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Avg Price{sortArrow('avg_price')}</th>
                  <th onClick={() => toggleSort('current_price')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Current{sortArrow('current_price')}</th>
                  <th onClick={() => toggleSort('pnl')} className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">PNL{sortArrow('pnl')}</th>
                  <th onClick={() => toggleSort('positions')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Positions{sortArrow('positions')}</th>
                  <th onClick={() => toggleSort('wallet_age_at_trade')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">Wallet Age at Trade{sortArrow('wallet_age_at_trade')}</th>
                  <th onClick={() => toggleSort('user')} className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">User{sortArrow('user')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-gray-500">No insiders found</td>
                  </tr>
                ) : (
                  rows.map((insider, idx) => (
                    <tr key={`${insider.user}-${idx}`} className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                        {insider.first_trade}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                        {insider.since_days} days
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        <div className="flex items-center gap-3">
                          {insider.image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={insider.image_url}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover border border-[#2a2a2a]"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-xs">?</div>
                          )}
                          <span className="line-clamp-2">{insider.market}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-center text-sm font-semibold ${insider.outcome === 'Yes' ? 'text-green-400' : 'text-red-400'}`}>
                        {insider.outcome}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 bg-yellow-400 text-black rounded text-xs font-bold">
                          {insider.z_score.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white">
                        {formatCurrency(insider.invested_usd)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-300">
                        {formatPrice(insider.avg_price)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-300">
                        {formatPrice(insider.current_price)}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm ${insider.pnl_dollar >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPnl(insider)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-white">
                        {insider.positions}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-white">
                        {insider.wallet_age_at_trade} days
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="px-2.5 py-1 rounded text-xs font-semibold font-mono"
                          style={{ backgroundColor: pickUserColor(insider.user), color: '#0a0a0a' }}
                        >
                          {insider.user}
                        </span>
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
