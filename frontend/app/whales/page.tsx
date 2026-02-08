'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBaseUrl } from '../../lib/api';
import Navbar from '../../components/Navbar';

interface Trader {
  rank: number;
  trader: string;
  address: string;
  total_positions: number;
  active_positions: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  current_value: number;
  overall_pnl: number;
  volume: number;
  profile_url: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  traders: Trader[];
  timestamp: string;
  error?: string;
}

type SortKey = 'rank' | 'trader' | 'total_positions' | 'active_positions' | 'total_wins' | 'total_losses' | 'win_rate' | 'current_value' | 'overall_pnl';
type SortDir = 'asc' | 'desc';

// Deterministic bright badge colors for trader chips
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
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  if (abs >= 1_000) return `${sign}$${abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  if (abs > 0) return `${sign}$${abs.toFixed(0)}`;
  return '$0';
}

// Bar component for wins/losses
function ValueBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? (Math.abs(value) / maxValue) * 100 : 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`text-sm font-semibold ${color}`}>
        {formatCurrency(value)}
      </span>
      <div className="w-20 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${value >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${Math.max(Math.min(pct, 100), 2)}%` }}
        />
      </div>
    </div>
  );
}

export default function WhalesPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showActive, setShowActive] = useState(false);
  const apiBaseUrl = getApiBaseUrl();

  const fetchWhales = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/whales?limit=50`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        setTraders(data.traders);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch leaderboard');
      }
    } catch {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchWhales();
    const interval = setInterval(fetchWhales, 60000);
    return () => clearInterval(interval);
  }, [fetchWhales]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'trader' ? 'asc' : 'desc');
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const filtered = useMemo(() => {
    let list = showActive ? traders.filter(t => t.active_positions > 0) : traders;

    list = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'rank': return dir * (a.rank - b.rank);
        case 'trader': return dir * a.trader.localeCompare(b.trader);
        case 'total_positions': return dir * (a.total_positions - b.total_positions);
        case 'active_positions': return dir * (a.active_positions - b.active_positions);
        case 'total_wins': return dir * (a.total_wins - b.total_wins);
        case 'total_losses': return dir * (a.total_losses - b.total_losses);
        case 'win_rate': return dir * (a.win_rate - b.win_rate);
        case 'current_value': return dir * (a.current_value - b.current_value);
        case 'overall_pnl': return dir * (a.overall_pnl - b.overall_pnl);
        default: return 0;
      }
    });

    return list;
  }, [traders, sortKey, sortDir, showActive]);

  const maxWin = Math.max(...traders.map(t => t.total_wins), 1);
  const maxLoss = Math.max(...traders.map(t => Math.abs(t.total_losses)), 1);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Page Header */}
        <h1 className="text-3xl font-bold mb-2">Leaderboards</h1>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
          {/* Category dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Category</span>
            <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2">
              <span className="text-sm text-white">Overall</span>
            </div>
          </div>

          {/* Filters button */}
          <button className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>

          {/* Active toggle */}
          <div className="flex items-center gap-3 md:ml-auto">
            <span className="text-sm text-gray-400">Active</span>
            <button
              onClick={() => setShowActive(!showActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                showActive ? 'bg-green-600' : 'bg-[#2a2a2a]'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  showActive ? 'translate-x-5' : ''
                }`}
              />
            </button>
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
            <button onClick={fetchWhales} className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  {/* Fav + Copy icons placeholder */}
                  <th className="w-16 px-3 py-4"></th>

                  <th
                    onClick={() => toggleSort('rank')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none w-20"
                  >
                    Rank{sortArrow('rank')}
                  </th>

                  <th
                    onClick={() => toggleSort('trader')}
                    className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Trader{sortArrow('trader')}
                  </th>

                  <th
                    onClick={() => toggleSort('total_positions')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Total Positions{sortArrow('total_positions')}
                  </th>

                  <th
                    onClick={() => toggleSort('active_positions')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Active Positions{sortArrow('active_positions')}
                  </th>

                  <th
                    onClick={() => toggleSort('total_wins')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Total Wins{sortArrow('total_wins')}
                  </th>

                  <th
                    onClick={() => toggleSort('total_losses')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Total Losses{sortArrow('total_losses')}
                  </th>

                  <th
                    onClick={() => toggleSort('win_rate')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Win Rate{sortArrow('win_rate')}
                  </th>

                  <th
                    onClick={() => toggleSort('current_value')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Current Value{sortArrow('current_value')}
                  </th>

                  <th
                    onClick={() => toggleSort('overall_pnl')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Overall PnL{sortArrow('overall_pnl')}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#2a2a2a]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                      No traders found
                    </td>
                  </tr>
                ) : (
                  filtered.map(trader => (
                    <tr key={trader.rank} className="hover:bg-[#1a1a1a] transition-colors">
                      {/* Star + Copy */}
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2">
                          <button className="text-gray-600 hover:text-yellow-400 transition-colors" title="Favorite">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                          <button className="text-gray-600 hover:text-white transition-colors" title="Copy address">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>

                      {/* Rank */}
                      <td className="px-4 py-4 text-center text-sm text-gray-400 font-medium">
                        {trader.rank}
                      </td>

                      {/* Trader name */}
                      <td className="px-4 py-4">
                        <a
                          href={trader.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-2.5 py-1 rounded text-xs font-semibold font-mono hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: pickUserColor(trader.trader), color: '#0a0a0a' }}
                        >
                          {trader.trader}
                        </a>
                      </td>

                      {/* Total Positions */}
                      <td className="px-4 py-4 text-center text-sm text-white">
                        {trader.total_positions}
                      </td>

                      {/* Active Positions */}
                      <td className="px-4 py-4 text-center text-sm text-white">
                        {trader.active_positions}
                      </td>

                      {/* Total Wins */}
                      <td className="px-4 py-4 text-right">
                        <ValueBar
                          value={trader.total_wins}
                          maxValue={maxWin}
                          color="text-green-400"
                        />
                      </td>

                      {/* Total Losses */}
                      <td className="px-4 py-4 text-right">
                        <ValueBar
                          value={trader.total_losses}
                          maxValue={maxLoss}
                          color={trader.total_losses < 0 ? 'text-red-400' : 'text-green-400'}
                        />
                      </td>

                      {/* Win Rate */}
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            trader.win_rate >= 80
                              ? 'bg-green-900/30 text-green-400 border border-green-900'
                              : trader.win_rate >= 50
                              ? 'bg-green-900/20 text-green-400'
                              : 'bg-red-900/20 text-red-400'
                          }`}
                        >
                          {trader.win_rate}%
                        </span>
                      </td>

                      {/* Current Value */}
                      <td className="px-4 py-4 text-right text-sm text-gray-300">
                        {formatCurrency(trader.current_value)}
                      </td>

                      {/* Overall PnL */}
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`text-sm font-bold px-3 py-1 rounded ${
                            trader.overall_pnl >= 0
                              ? 'text-green-400 bg-green-900/20'
                              : 'text-red-400 bg-red-900/20'
                          }`}
                        >
                          {formatCurrency(trader.overall_pnl)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && (
          <div className="flex flex-wrap gap-6 mt-4 text-sm text-gray-500">
            <div>
              Total traders: <span className="text-white font-semibold">{filtered.length}</span>
            </div>
            <div>
              Active traders: <span className="text-green-400 font-semibold">{filtered.filter(t => t.active_positions > 0).length}</span>
            </div>
            <div>
              Avg Win Rate: <span className="text-white font-semibold">
                {filtered.length > 0 ? (filtered.reduce((s, t) => s + t.win_rate, 0) / filtered.length).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
