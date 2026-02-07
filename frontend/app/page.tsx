'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import InfoCards from '../components/InfoCards';
import MarketsTable from '../components/MarketsTable';
import TradesTable from '../components/TradesTable';

interface Market {
  spread: number;
  is_unusual: boolean;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    // Update time every second
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
      }));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Navbar */}
      <Navbar />

      {/* Subtitle / Description Line */}
      <div className="border-b border-[#2a2a2a] bg-[#0a0a0a]">
        <div className="max-w-[1920px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Track unusual opportunities & cross-platform arbitrage between Kalshi & Polymarket.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">UPDATED</span>
              <span className="text-green-400 font-mono font-semibold">
                {currentTime}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Info Cards */}
        <InfoCards markets={markets} />

        {/* Active Markets Section */}
        <div className="space-y-4">
          {/* Section Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span>📊</span>
              Active Markets
            </h2>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors">
                Filter
              </button>
              <button className="px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-400 transition-colors">
                Export
              </button>
            </div>
          </div>

          {/* Markets Table */}
          <MarketsTable onMarketsUpdate={setMarkets} />
        </div>

        {/* Recent Trades Section */}
        <div className="space-y-4 mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span>🧾</span>
              Recent Trades
            </h2>
          </div>
          <TradesTable />
        </div>

        {/* Footer Info */}
        <div className="mt-8 p-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
          <h3 className="font-semibold mb-2 text-white">About UnusualProbs</h3>
          <p className="text-sm text-gray-400">
            UnusualProbs aggregates prediction markets from Polymarket and Kalshi, 
            highlighting opportunities where there are significant price differences 
            (spreads) between the two platforms. Markets with spreads greater than 
            10% are flagged as "Unusual" and may indicate arbitrage opportunities 
            or information asymmetries.
          </p>
        </div>
      </div>
    </main>
  );
}
