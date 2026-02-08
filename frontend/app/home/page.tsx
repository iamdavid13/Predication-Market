'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { getApiBaseUrl } from '../../lib/api';

interface Sector {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  preview_image?: string;
  cover_image?: string;
}

interface Market {
  id: string;
  question: string;
  source: string;
  sources?: string[];
  url: string;
  image_url: string;
  price: number | null;
  volume: number;
  outcomes?: { name: string; price: number | null }[];
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
}

interface SectorDetail {
  sector: Sector;
  markets: Market[];
  trades: Trade[];
  count: number;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return '$0';
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

function SectorCard({ sector, onClick, isActive }: { sector: Sector; onClick: () => void; isActive: boolean }) {
  const bgImage = sector.cover_image || sector.preview_image;
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-end justify-end overflow-hidden rounded-2xl border min-w-[130px] h-[100px] transition-all duration-200 cursor-pointer select-none ${
        isActive
          ? 'scale-[1.03] shadow-lg shadow-black/40 ring-2'
          : 'border-[#2a2a2a] hover:border-[#4a4a4a] hover:scale-[1.02]'
      }`}
      style={isActive ? {
        borderColor: sector.color,
        ringColor: sector.color,
        boxShadow: `0 4px 24px ${sector.color}33`,
        // @ts-expect-error ring color via style
        '--tw-ring-color': sector.color,
      } : undefined}
    >
      {/* Background photo */}
      {bgImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <div className="absolute inset-0 bg-[#111]" />
      )}
      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 group-hover:from-black/80 group-hover:via-black/40 transition-all duration-300" />
      {/* Content */}
      <div className="relative z-10 w-full px-3 pb-2.5">
        <span className="text-sm font-bold text-white drop-shadow-lg leading-tight">
          {sector.name}
        </span>
      </div>
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full z-20" style={{ backgroundColor: sector.color }} />
      )}
    </button>
  );
}

function MarketRow({ market, index }: { market: Market; index: number }) {
  const yesPrice = market.outcomes?.find(o => o.name === 'Yes')?.price;
  const noPrice = market.outcomes?.find(o => o.name === 'No')?.price;
  const displayPrice = yesPrice ?? market.price;

  return (
    <div className="group flex items-center gap-4 px-5 py-4 border-b border-[#1a1a1a] hover:bg-[#131318] transition-colors">
      <span className="text-sm text-gray-600 font-mono w-6 shrink-0">{index + 1}</span>
      {market.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={market.image_url}
          alt=""
          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#2a2a2a]"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-lg shrink-0">
          📊
        </div>
      )}
      <div className="flex-1 min-w-0">
        <a
          href={market.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-1"
        >
          {market.question}
        </a>
        <div className="flex items-center gap-2 mt-0.5">
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
        </div>
      </div>
      <div className="text-right shrink-0">
        {displayPrice != null ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-white">{displayPrice.toFixed(0)}%</div>
              <div className="text-[11px] text-gray-500">Yes</div>
            </div>
            {noPrice != null && (
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-400">{noPrice.toFixed(0)}%</div>
                <div className="text-[11px] text-gray-500">No</div>
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-500">—</span>
        )}
      </div>
    </div>
  );
}

function TradeChip({ trade }: { trade: Trade }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#111] border border-[#1f1f1f] rounded-xl hover:border-[#2a2a2a] transition-colors min-w-[260px]">
      <span className={`shrink-0 inline-flex w-7 h-7 items-center justify-center rounded-md text-xs font-bold ${
        trade.side === 'buy'
          ? 'bg-green-900/30 text-green-400 border border-green-800/40'
          : 'bg-red-900/30 text-red-400 border border-red-800/40'
      }`}>
        {trade.side === 'buy' ? '↑' : '↓'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white font-medium line-clamp-1">{trade.market}</div>
        <div className="text-[11px] text-gray-500 mt-0.5">{timeAgo(trade.trade_time)} · {trade.exchange}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-white">{formatCurrency(trade.value)}</div>
        <div className="text-[11px] text-gray-500">{trade.shares.toFixed(0)} shr</div>
      </div>
    </div>
  );
}

function HeroStats({ totalMarkets, totalTrades }: { totalMarkets: number; totalTrades: number }) {
  return (
    <div className="flex items-center gap-8 px-1">
      <div>
        <div className="text-2xl font-bold text-white">{totalMarkets.toLocaleString()}</div>
        <div className="text-xs text-gray-500 uppercase tracking-wider">Markets Tracked</div>
      </div>
      <div className="w-px h-10 bg-[#2a2a2a]" />
      <div>
        <div className="text-2xl font-bold text-white">{totalTrades.toLocaleString()}</div>
        <div className="text-xs text-gray-500 uppercase tracking-wider">Live Trades</div>
      </div>
      <div className="w-px h-10 bg-[#2a2a2a]" />
      <div>
        <div className="text-2xl font-bold text-green-400">2</div>
        <div className="text-xs text-gray-500 uppercase tracking-wider">Exchanges</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [activeSector, setActiveSector] = useState<string>('trending');
  const [sectorDetail, setSectorDetail] = useState<SectorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [totalMarkets, setTotalMarkets] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiBaseUrl = getApiBaseUrl();

  // Fetch sectors
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sectors`);
        const data = await res.json();
        if (data.success) setSectors(data.sectors);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [apiBaseUrl]);

  // Fetch stats for hero
  useEffect(() => {
    async function load() {
      try {
        const [mkRes, stRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/all-markets?limit=5`),
          fetch(`${apiBaseUrl}/api/stats`),
        ]);
        const mkData = await mkRes.json();
        const stData = await stRes.json();
        if (mkData.success) setTotalMarkets(mkData.count || 0);
        const kws = stData.kalshi_ws?.total_trades || 0;
        const pws = stData.poly_ws?.total_trades || 0;
        setTotalTrades(kws + pws);
      } catch {
        /* ignore */
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  // Fetch sector detail when active sector changes
  const fetchSectorDetail = useCallback(async (slug: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sectors/${slug}?limit=50`);
      const data = await res.json();
      if (data.success) {
        setSectorDetail(data);
      }
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchSectorDetail(activeSector);
  }, [activeSector, fetchSectorDetail]);

  // Auto-refresh sector detail every 30s
  useEffect(() => {
    const interval = setInterval(() => fetchSectorDetail(activeSector), 30000);
    return () => clearInterval(interval);
  }, [activeSector, fetchSectorDetail]);

  const activeSectorData = sectors.find(s => s.slug === activeSector);

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <Navbar />

      {/* Hero */}
      <div className="border-b border-[#1a1a1a]">
        <div className="max-w-[1400px] mx-auto px-6 pt-10 pb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight">
                Explore Markets
              </h1>
              <p className="text-gray-400 mt-2 text-base max-w-lg">
                Browse prediction markets across sectors. Live data from Polymarket &amp; Kalshi.
              </p>
            </div>
            <HeroStats totalMarkets={totalMarkets} totalTrades={totalTrades} />
          </div>
        </div>
      </div>

      {/* Sector Pills */}
      <div className="border-b border-[#1a1a1a] bg-[#0c0c0c]">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          {loading ? (
            <div className="flex gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-[120px] h-[90px] rounded-2xl bg-[#151515] animate-pulse" />
              ))}
            </div>
          ) : (
            <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {sectors.map(sector => (
                <SectorCard
                  key={sector.slug}
                  sector={sector}
                  isActive={activeSector === sector.slug}
                  onClick={() => setActiveSector(sector.slug)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sector Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Sector Header */}
        {activeSectorData && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{activeSectorData.emoji}</span>
              <div>
                <h2 className="text-2xl font-bold text-white">{activeSectorData.name}</h2>
                <p className="text-sm text-gray-400">{activeSectorData.description}</p>
              </div>
            </div>
            <Link
              href={`/sector/${activeSector}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#2a2a2a] bg-[#111] text-sm text-gray-300 hover:text-white hover:border-[#3a3a3a] transition-colors"
            >
              View All
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {detailLoading && !sectorDetail ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[72px] bg-[#111] rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[72px] bg-[#111] rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : sectorDetail ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Markets List */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300">
                    Top Markets <span className="text-gray-500 font-normal">({sectorDetail.count})</span>
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </div>
                </div>
                {sectorDetail.markets.length === 0 ? (
                  <div className="px-5 py-12 text-center text-gray-500 text-sm">
                    No markets found in this sector yet.
                  </div>
                ) : (
                  sectorDetail.markets.map((market, i) => (
                    <MarketRow key={market.id || i} market={market} index={i} />
                  ))
                )}
              </div>
            </div>

            {/* Sidebar: Recent Trades */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 px-1">Recent Trades</h3>
              {sectorDetail.trades.length === 0 ? (
                <div className="text-sm text-gray-500 px-1">No recent trades in this sector.</div>
              ) : (
                sectorDetail.trades.map(trade => (
                  <TradeChip key={trade.id} trade={trade} />
                ))
              )}
              <Link
                href="/trades"
                className="flex items-center justify-center gap-1 mt-2 text-xs text-gray-400 hover:text-white transition-colors"
              >
                View all trades →
              </Link>
            </div>
          </div>
        ) : null}

        {/* Quick Links */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/markets" className="group flex items-center gap-4 p-5 rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#3a3a3a] transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-900/20 border border-blue-800/30 flex items-center justify-center text-xl">📈</div>
            <div>
              <div className="font-semibold text-white group-hover:text-blue-400 transition-colors">All Markets</div>
              <div className="text-xs text-gray-500 mt-0.5">Browse every market on both exchanges</div>
            </div>
          </Link>
          <Link href="/trades" className="group flex items-center gap-4 p-5 rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#3a3a3a] transition-all">
            <div className="w-12 h-12 rounded-xl bg-green-900/20 border border-green-800/30 flex items-center justify-center text-xl">⚡</div>
            <div>
              <div className="font-semibold text-white group-hover:text-green-400 transition-colors">Live Trades</div>
              <div className="text-xs text-gray-500 mt-0.5">Real-time trade stream from Kalshi &amp; Polymarket</div>
            </div>
          </Link>
          <Link href="/whales" className="group flex items-center gap-4 p-5 rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] hover:border-[#3a3a3a] transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-900/20 border border-purple-800/30 flex items-center justify-center text-xl">🐋</div>
            <div>
              <div className="font-semibold text-white group-hover:text-purple-400 transition-colors">Top Whales</div>
              <div className="text-xs text-gray-500 mt-0.5">Track the biggest prediction market traders</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
