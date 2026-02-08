'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { getApiBaseUrl } from '../../lib/api';
import Navbar from '../../components/Navbar';

interface Market {
  id: string;
  question: string;
  source: string;
  url: string;
  image_url: string;
  price: number | null;
  volume: number;
  open_interest: number;
  end_date: string;
  description: string;
  category: string;
  tags: string[];
  num_outcomes: number;
  outcomes?: { name: string; price: number | null }[];
  last_updated: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  markets: Market[];
  source: string;
  timestamp: string;
  error?: string;
}

type SortKey = 'question' | 'volume' | 'open_interest' | 'end_date' | 'tags';
type SortDir = 'asc' | 'desc';

// Generate a deterministic color/icon from the market question for consistent display
function getMarketIcon(question: string, category: string): { emoji: string; bgColor: string } {
  const q = (question + category).toLowerCase();

  if (q.includes('bitcoin') || q.includes('crypto') || q.includes('ethereum'))
    return { emoji: '₿', bgColor: 'bg-orange-900/40' };
  if (q.includes('president') || q.includes('election') || q.includes('vote') || q.includes('democrat') || q.includes('republican'))
    return { emoji: '🗳️', bgColor: 'bg-blue-900/40' };
  if (q.includes('fed') || q.includes('interest rate') || q.includes('inflation') || q.includes('economic'))
    return { emoji: '🏦', bgColor: 'bg-green-900/40' };
  if (q.includes('war') || q.includes('strike') || q.includes('iran') || q.includes('russia') || q.includes('ukraine') || q.includes('ceasefire'))
    return { emoji: '🌍', bgColor: 'bg-red-900/40' };
  if (q.includes('nfl') || q.includes('nba') || q.includes('game') || q.includes('super bowl') || q.includes('sport'))
    return { emoji: '🏈', bgColor: 'bg-emerald-900/40' };
  if (q.includes('greenland') || q.includes('territory') || q.includes('acquire'))
    return { emoji: '🗺️', bgColor: 'bg-cyan-900/40' };
  if (q.includes('portugal') || q.includes('europe'))
    return { emoji: '🇪🇺', bgColor: 'bg-indigo-900/40' };
  if (q.includes('trump'))
    return { emoji: '🇺🇸', bgColor: 'bg-red-900/40' };
  if (q.includes('venezuela'))
    return { emoji: '🌎', bgColor: 'bg-yellow-900/40' };

  // Fallback based on hash of question
  const emojis = ['📊', '📈', '🔮', '💡', '⚡', '🎯', '🧩', '🔎'];
  const colors = ['bg-purple-900/40', 'bg-pink-900/40', 'bg-teal-900/40', 'bg-amber-900/40'];
  const hash = question.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return { emoji: emojis[hash % emojis.length], bgColor: colors[hash % colors.length] };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return '$0';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function splitMarketQuestion(question: string): { parent: string; outcome: string } {
  const parts = question.split(' - ');
  if (parts.length >= 2) {
    return { parent: parts[0].trim(), outcome: parts.slice(1).join(' - ').trim() };
  }
  return { parent: question.trim(), outcome: question.trim() };
}

function mergeUniqueTags(base: string[], extra: string[]): string[] {
  const set = new Set(base);
  for (const tag of extra) {
    if (tag) set.add(tag);
  }
  return Array.from(set);
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'polymarket' | 'kalshi'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const apiBaseUrl = getApiBaseUrl();

  const fetchMarkets = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/all-markets?source=${sourceFilter}&limit=1500`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        setMarkets(data.markets.filter(m => m && m.question));
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch markets');
      }
    } catch {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, sourceFilter]);

  useEffect(() => {
    setLoading(true);
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 60000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const filtered = useMemo(() => {
    let list = markets;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => {
        const { parent, outcome } = splitMarketQuestion(m.question);
        return (
          parent.toLowerCase().includes(q) ||
          outcome.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.tags.some(t => t.toLowerCase().includes(q))
        );
      });
    }

    // Group by parent question to avoid duplicate rows
    const groupedMap = new Map<string, Market>();
    for (const m of list) {
      const { parent, outcome } = splitMarketQuestion(m.question);
      const key = `${m.source}::${parent}`;
      const existing = groupedMap.get(key);
      const hasExplicitOutcomes = Array.isArray(m.outcomes) && m.outcomes.length > 0;
      const outcomeName = outcome !== parent ? outcome : '';

      if (!existing) {
        groupedMap.set(key, {
          ...m,
          question: parent,
          outcomes: hasExplicitOutcomes
            ? m.outcomes?.map(o => ({ name: o.name, price: o.price }))
            : outcomeName
              ? [{ name: outcomeName, price: m.price }]
              : undefined,
          tags: m.tags || [],
        });
      } else {
        if (hasExplicitOutcomes) {
          const merged = [...(existing.outcomes || [])];
          for (const o of m.outcomes || []) {
            if (!merged.some(item => item.name === o.name)) {
              merged.push({ name: o.name, price: o.price });
            }
          }
          existing.outcomes = merged;
        } else if (outcomeName) {
          const merged = [...(existing.outcomes || [])];
          if (!merged.some(item => item.name === outcomeName)) {
            merged.push({ name: outcomeName, price: m.price });
          }
          existing.outcomes = merged;
        }

        existing.volume += m.volume || 0;
        existing.open_interest += m.open_interest || 0;
        existing.tags = mergeUniqueTags(existing.tags || [], m.tags || []);
        if (!existing.image_url && m.image_url) {
          existing.image_url = m.image_url;
        }
        if (!existing.description && m.description) {
          existing.description = m.description;
        }
        if (!existing.end_date && m.end_date) {
          existing.end_date = m.end_date;
        }
      }
    }

    const groupedList = Array.from(groupedMap.values());

    groupedList.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'question':
          return dir * a.question.localeCompare(b.question);
        case 'volume':
          return dir * ((a.volume || 0) - (b.volume || 0));
        case 'open_interest':
          return dir * ((a.open_interest || 0) - (b.open_interest || 0));
        case 'end_date':
          return dir * ((a.end_date || '').localeCompare(b.end_date || ''));
        case 'tags':
          return dir * ((a.tags?.[0] || '').localeCompare(b.tags?.[0] || ''));
        default:
          return 0;
      }
    });
    return groupedList;
  }, [markets, searchQuery, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sourceFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filtered.length, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pageRows = filtered.slice(startIndex, startIndex + pageSize);

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isActiveMarket = (endDate: string) => {
    if (!endDate) return true;
    const d = new Date(endDate);
    if (isNaN(d.getTime())) return true;
    return d.getTime() > Date.now();
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Page Header */}
        <h1 className="text-3xl font-bold mb-2">All Markets</h1>

        {/* Toolbar: Search + Filters */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search terms..."
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 pl-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Source Filter Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as 'all' | 'polymarket' | 'kalshi')}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Sources</option>
              <option value="polymarket">Polymarket</option>
              <option value="kalshi">Kalshi</option>
            </select>
            {sourceFilter !== 'all' && (
              <button
                onClick={() => setSourceFilter('all')}
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Subtitle hint */}
          <p className="text-xs text-gray-500 md:ml-auto">
            Click on a column header to sort.
          </p>
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
            <button onClick={fetchMarkets} className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Markets Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
                <tr>
                  <th className="w-8 px-3 py-4"></th>
                  <th
                    onClick={() => toggleSort('question')}
                    className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Market{sortArrow('question')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th
                    onClick={() => toggleSort('volume')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Volume{sortArrow('volume')}
                  </th>
                  <th
                    onClick={() => toggleSort('open_interest')}
                    className="px-4 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Open Interest{sortArrow('open_interest')}
                  </th>
                  <th
                    onClick={() => toggleSort('end_date')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Ends{sortArrow('end_date')}
                  </th>
                  <th
                    onClick={() => toggleSort('tags')}
                    className="px-4 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Tags{sortArrow('tags')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#2a2a2a]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No markets found
                    </td>
                  </tr>
                ) : (
                  pageRows.map(market => {
                    const icon = getMarketIcon(market.question, market.category);
                    const maxVol = Math.max(...filtered.map(m => m.volume || 0), 1);
                    const volPct = ((market.volume || 0) / maxVol) * 100;
                    const oiMax = Math.max(...filtered.map(m => m.open_interest || 0), 1);
                    const oiPct = ((market.open_interest || 0) / oiMax) * 100;
                    const marketKey = `${market.source}-${market.id}`;
                    const isOpen = expanded.has(marketKey);
                    const active = isActiveMarket(market.end_date);
                    const outcomes = (market.outcomes && market.outcomes.length > 0)
                      ? market.outcomes
                      : [
                          { name: 'Yes', price: market.price },
                          { name: 'No', price: market.price !== null ? Math.max(0, 100 - market.price) : null }
                        ];

                    return (
                      <Fragment key={marketKey}>
                        <tr className="hover:bg-[#1a1a1a] transition-colors group">
                          {/* Expand / plus icon */}
                          <td className="px-3 py-4 text-center">
                            <button
                              onClick={() => toggleExpanded(marketKey)}
                              className="text-gray-600 hover:text-white text-lg leading-none"
                              aria-label={isOpen ? 'Collapse market' : 'Expand market'}
                            >
                              {isOpen ? '−' : '+'}
                            </button>
                          </td>

                        {/* Market name + icon */}
                        <td className="px-4 py-4 max-w-xs">
                          <div className="flex items-center gap-3">
                            {market.image_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={market.image_url}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-[#2a2a2a]"
                                onError={(e) => {
                                  // If image fails to load, replace with emoji
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <span
                              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${icon.bgColor} ${market.image_url ? 'hidden' : ''}`}
                            >
                              {icon.emoji}
                            </span>
                            <a
                              href={market.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-white hover:text-blue-300 hover:underline line-clamp-2"
                            >
                              {market.question}
                            </a>
                          </div>
                        </td>

                        {/* Source badge */}
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              market.source === 'Polymarket'
                                ? 'text-blue-400 border-blue-900 bg-blue-900/20'
                                : 'text-green-400 border-green-900 bg-green-900/20'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {market.source}
                          </span>
                        </td>

                        {/* Volume with bar */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-white">
                              {formatCurrency(market.volume)}
                            </span>
                            <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.max(volPct, 2)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Open Interest with bar */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-white">
                              {formatCurrency(market.open_interest)}
                            </span>
                            <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.max(oiPct, 2)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* End date */}
                        <td className="px-4 py-4 text-center text-sm text-gray-400">
                          {formatDate(market.end_date)}
                        </td>

                        {/* Tags */}
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-wrap justify-center gap-1">
                            {market.category && (
                              <span className="px-2 py-0.5 bg-[#2a2a2a] rounded text-xs text-gray-300">
                                {market.category}
                              </span>
                            )}
                            {market.tags.slice(0, 2).map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-[#2a2a2a] rounded text-xs text-gray-400">
                                {tag}
                              </span>
                            ))}
                            {market.num_outcomes > 0 && (
                              <span className="px-2 py-0.5 bg-[#2a2a2a] rounded text-xs text-gray-500">
                                +{market.num_outcomes}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Description */}
                        <td className="px-4 py-4 max-w-xs">
                          <p className="text-xs text-white/90 line-clamp-2">
                            {market.description || '—'}
                          </p>
                        </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[#101010]">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="space-y-2">
                                {outcomes.map((outcome, idx) => (
                                  <div key={`${marketKey}-${idx}`} className="flex items-center gap-4">
                                    <div className="flex items-center gap-3 min-w-[320px]">
                                      {market.image_url ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                          src={market.image_url}
                                          alt=""
                                          className="w-6 h-6 rounded-full object-cover border border-[#2a2a2a]"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${icon.bgColor}`}>
                                          {icon.emoji}
                                        </span>
                                      )}
                                      <span className="text-sm text-white font-medium">{outcome.name}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${active ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                                        {active ? 'Active' : 'Closed'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-gray-400">Outcome</span>
                                      <span className={`text-sm font-semibold ${outcome.name.toLowerCase() === 'yes' ? 'text-green-400' : 'text-red-400'}`}>
                                        {outcome.name}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 ml-auto">
                                      <span className="text-xs text-gray-400">Price</span>
                                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] text-white">
                                        {outcome.price !== null ? `${outcome.price.toFixed(2)}%` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & stats */}
        {!loading && !error && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-2 py-1 text-sm text-white"
                >
                  {[25, 50, 100, 200].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 ml-auto text-gray-300">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-3 py-1 rounded-md border border-[#2a2a2a] text-sm ${page === 1 ? 'text-gray-600 cursor-not-allowed' : 'hover:border-gray-400'}`}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`px-3 py-1 rounded-md border border-[#2a2a2a] text-sm ${page === totalPages ? 'text-gray-600 cursor-not-allowed' : 'hover:border-gray-400'}`}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm text-gray-500">
              <div>
                Total: <span className="text-white font-semibold">{filtered.length}</span> markets
              </div>
              <div>
                Polymarket: <span className="text-blue-400 font-semibold">{filtered.filter(m => m.source === 'Polymarket').length}</span>
              </div>
              <div>
                Kalshi: <span className="text-green-400 font-semibold">{filtered.filter(m => m.source === 'Kalshi').length}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
