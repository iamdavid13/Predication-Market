'use client';

interface Market {
  spread: number;
  is_unusual: boolean;
}

interface InfoCardsProps {
  markets: Market[];
}

export default function InfoCards({ markets }: InfoCardsProps) {
  // Calculate stats
  const liveOpportunities = markets.filter(m => m.is_unusual || m.spread > 8).length;
  const highVolatilityCount = markets.filter(m => m.spread > 8).length;
  const avgSpread = markets.length > 0
    ? (markets.reduce((sum, m) => sum + m.spread, 0) / markets.length).toFixed(1)
    : '0.0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Live Opportunity Card */}
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 overflow-hidden group hover:border-green-900 transition-colors">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
          <svg viewBox="0 0 24 24" fill="currentColor" className="text-green-500 w-full h-full">
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-green-900/20 border border-green-900 rounded text-xs text-green-400 font-semibold">
              Live Opportunity
            </span>
          </div>
          <div className="text-4xl font-bold text-white mb-2">
            {liveOpportunities}
          </div>
          <div className="flex items-center gap-1 text-sm text-green-400 hover:text-green-300 transition-colors cursor-pointer">
            Active Arbitrage Plays
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </div>
        </div>
      </div>

      {/* High Volatility Card */}
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 overflow-hidden group hover:border-red-900 transition-colors">
        {/* Background decoration - pulse/heartbeat line */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-500 w-full h-full" strokeWidth="2">
            <path d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 bg-red-900/20 border border-red-900 rounded text-xs text-red-400 font-semibold">
              High Volatility
            </span>
          </div>
          <div className="text-4xl font-bold text-white mb-2">
            {highVolatilityCount}
          </div>
          <div className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer">
            Markets with &gt;8% Spread
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </div>
        </div>
      </div>

      {/* Average Spread Card */}
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 overflow-hidden group hover:border-purple-900 transition-colors">
        {/* Background decoration - chart line */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-purple-500 w-full h-full" strokeWidth="2">
            <path d="M3 17l4-4 4 4 5-5 5 5" />
            <path d="M21 7v10" />
          </svg>
        </div>
        
        <div className="relative z-10">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">
            AVG. SPREAD
          </div>
          <div className="text-4xl font-bold text-white mb-2">
            {avgSpread}%
          </div>
          <div className="text-sm text-purple-400">
            Across all markets
          </div>
        </div>
      </div>
    </div>
  );
}
