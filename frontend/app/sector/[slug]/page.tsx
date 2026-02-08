'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { getApiBaseUrl } from '../../../lib/api';

interface Market {
  id: string;
  question: string;
  source: string;
  sources?: string[];
  url: string;
  image_url: string;
  price: number | null;
  volume: number;
  open_interest: number;
  end_date: string;
  description: string;
  outcomes?: { name: string; price: number | null }[];
  tags: string[];
}

interface Trade {
  id: string;
  market: string;
  side: string;
  value: number;
  price_dollars: number;
  shares: number;
  exchange: string;
  trade_time: string;
  outcome: string;
}

interface SectorMeta {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
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
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SectorDetailPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const apiBaseUrl = getApiBaseUrl();

  const [sector, setSector] = useState<SectorMeta | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketCount, setMarketCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sectors/${slug}?limit=50`);
      const data = await res.json();
      if (data.success) {
        setSector(data.sector);
        setMarkets(data.markets || []);
        setTrades(data.trades || []);
        setMarketCount(data.count || 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, slug]);

  useEffect(() => {
    if (slug) fetchData();
  }, [slug, fetchData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <div className="max-w-[1400px] mx-auto px-6 py-16">
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#111] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <Navbar />

      {/* Sector Header */}
      <div className="border-b border-[#1a1a1a]" style={{ background: `linear-gradient(135deg, ${sector?.color}08 0%, transparent 60%)` }}>
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link href="/home" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <span className="text-gray-300">{sector?.name || slug}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-5xl">{sector?.emoji}</span>
            <div>
              <h1 className="text-3xl font-bold text-white">{sector?.name}</h1>
              <p className="text-gray-400 mt-1">{sector?.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 mt-6 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111] border border-[#1f1f1f]">
              <span className="text-gray-500">Markets</span>
              <span className="font-semibold text-white">{marketCount}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111] border border-[#1f1f1f]">
              <span className="text-gray-500">Recent Trades</span>
              <span className="font-semibold text-white">{trades.length}</span>
            </div>
            <div className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Markets */}
          <div className="xl:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Top Markets
              <span className="text-sm font-normal text-gray-500">by volume</span>
            </h2>

            {markets.length === 0 ? (
              <div className="py-20 text-center text-gray-500">No markets found in this sector.</div>
            ) : (
              <div className="space-y-3">
                {markets.map((market, i) => {
                  const yesPrice = market.outcomes?.find(o => o.name === 'Yes')?.price;
                  const noPrice = market.outcomes?.find(o => o.name === 'No')?.price;
                  const displayPrice = yesPrice ?? market.price;

                  return (
                    <div
                      key={market.id || i}
                      className="group rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#2a2a2a] transition-all overflow-hidden"
                    >
                      <div className="flex items-start gap-4 p-5">
                        <span className="text-sm text-gray-600 font-mono w-6 pt-1 shrink-0">{i + 1}</span>
                        {market.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={market.image_url}
                            alt=""
                            className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#2a2a2a]"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-2xl shrink-0">
                            📊
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <a
                            href={market.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2"
                          >
                            {market.question}
                          </a>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {(market.sources && market.sources.length > 0 ? market.sources : [market.source]).map(src => (
                              <span key={src} className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                                src === 'Kalshi'
                                  ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                                  : 'bg-blue-900/30 text-blue-400 border border-blue-800/40'
                              }`}>
                                {src}
                              </span>
                            ))}
                            <span className="text-xs text-gray-500">{formatCurrency(market.volume)} vol</span>
                            {market.open_interest > 0 && (
                              <span className="text-xs text-gray-500">{formatCurrency(market.open_interest)} OI</span>
                            )}
                            {market.end_date && (
                              <span className="text-xs text-gray-600">Ends {formatDate(market.end_date)}</span>
                            )}
                          </div>
                          {market.description && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{market.description}</p>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {displayPrice != null && (
                            <div className="px-3 py-1.5 rounded-lg text-center min-w-[60px]" style={{
                              backgroundColor: `${sector?.color}15`,
                              border: `1px solid ${sector?.color}30`,
                            }}>
                              <div className="text-lg font-bold text-white">{displayPrice.toFixed(0)}%</div>
                              <div className="text-[10px] text-gray-500 uppercase">Yes</div>
                            </div>
                          )}
                          {noPrice != null && (
                            <div className="px-3 py-1 rounded-md text-center min-w-[60px] bg-[#151515] border border-[#1f1f1f]">
                              <div className="text-sm font-semibold text-gray-400">{noPrice.toFixed(0)}%</div>
                              <div className="text-[10px] text-gray-600 uppercase">No</div>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Outcome bar */}
                      {displayPrice != null && (
                        <div className="h-1 w-full bg-[#151515]">
                          <div
                            className="h-full rounded-r transition-all duration-500"
                            style={{ width: `${Math.min(displayPrice, 100)}%`, backgroundColor: sector?.color }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Activity Feed */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                ⚡ Recent Activity
              </h2>
              {trades.length === 0 ? (
                <div className="text-sm text-gray-500">No recent trades.</div>
              ) : (
                <div className="space-y-2">
                  {trades.map(trade => (
                    <div
                      key={trade.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#2a2a2a] transition-colors"
                    >
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        trade.side === 'buy'
                          ? 'bg-green-900/20 text-green-400 border border-green-800/40'
                          : 'bg-red-900/20 text-red-400 border border-red-800/40'
                      }`}>
                        {trade.side === 'buy' ? '↑' : '↓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-medium line-clamp-1">{trade.market}</div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                          <span>{trade.outcome}</span>
                          <span>·</span>
                          <span>{trade.exchange}</span>
                          <span>·</span>
                          <span>{timeAgo(trade.trade_time)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-white">{formatCurrency(trade.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Explore More</h3>
              <div className="space-y-2">
                <Link href="/home" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1">
                  ← Back to all sectors
                </Link>
                <Link href="/trades" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1">
                  ⚡ Live Trade Feed
                </Link>
                <Link href="/markets" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1">
                  📈 All Markets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
