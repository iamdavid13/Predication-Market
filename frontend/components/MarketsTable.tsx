'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from '../lib/api';

interface Market {
  id: string;
  question: string;
  polymarket_price: number;
  kalshi_price: number;
  spread: number;
  is_unusual: boolean;
  polymarket_url: string;
  kalshi_url: string;
  last_updated: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  markets: Market[];
  timestamp: string;
  error?: string;
}

interface MarketsTableProps {
  onMarketsUpdate?: (markets: Market[]) => void;
}

export default function MarketsTable({ onMarketsUpdate }: MarketsTableProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const fetchMarkets = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/markets`);
      const data: ApiResponse = await response.json();
      
      if (data.success) {
        setMarkets(data.markets);
        if (onMarketsUpdate) {
          onMarketsUpdate(data.markets);
        }
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch markets');
      }
    } catch {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, onMarketsUpdate]);

  useEffect(() => {
    fetchMarkets();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  const getTimeSinceUpdate = (lastUpdated: string) => {
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  };

  const hasArbitrage = (market: Market) => {
    return market.is_unusual || market.spread > 8;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-900 rounded-lg p-6 text-center">
        <p className="text-red-400">⚠️ {error}</p>
        <button
          onClick={fetchMarkets}
          className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Event Topic
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Polymarket
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Kalshi (Yes)
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Spread
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Arbitrage
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Links
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {markets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No markets with spread &gt; 5% found
                </td>
              </tr>
            ) : (
              markets.map((market) => (
                <tr
                  key={market.id}
                  className="hover:bg-[#1a1a1a] transition-colors"
                >
                  {/* Event Topic */}
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-white mb-2">
                          {market.question}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span className="text-gray-500">
                              Updated {getTimeSinceUpdate(market.last_updated)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Polymarket */}
                  <td className="px-6 py-4 text-center">
                    <span className={`text-lg font-semibold ${
                      market.polymarket_price > 50 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {market.polymarket_price}%
                    </span>
                  </td>

                  {/* Kalshi (Yes) */}
                  <td className="px-6 py-4 text-center">
                    <span className={`text-lg font-semibold ${
                      market.kalshi_price > 50 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {market.kalshi_price}%
                    </span>
                  </td>

                  {/* Spread */}
                  <td className="px-6 py-4 text-center">
                    {market.spread > 8 ? (
                      <span className="inline-block px-3 py-1 bg-red-900/20 border border-red-900 rounded-full text-sm font-semibold text-red-400">
                        {market.spread}%
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-yellow-400">
                        {market.spread}%
                      </span>
                    )}
                  </td>

                  {/* Arbitrage */}
                  <td className="px-6 py-4 text-center">
                    {hasArbitrage(market) ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-green-400 font-semibold">
                          Yes +{market.spread}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </td>

                  {/* Links */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <a
                        href={market.polymarket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center bg-[#0a0a0a] border border-[#2a2a2a] rounded-full text-xs font-semibold text-gray-400 hover:text-blue-400 hover:border-blue-500 transition-colors"
                        title="View on Polymarket"
                      >
                        P
                      </a>
                      <a
                        href={market.kalshi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center bg-[#0a0a0a] border border-[#2a2a2a] rounded-full text-xs font-semibold text-gray-400 hover:text-green-400 hover:border-green-500 transition-colors"
                        title="View on Kalshi"
                      >
                        K
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-400">
        <div>
          Total markets: <span className="text-white font-semibold">{markets.length}</span>
        </div>
        <div>
          Arbitrage opportunities: <span className="text-green-400 font-semibold">
            {markets.filter(m => hasArbitrage(m)).length}
          </span>
        </div>
      </div>
    </div>
  );
}
