'use client';

import { useEffect, useState } from 'react';

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

export default function MarketsTable() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchMarkets = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/markets');
      const data: ApiResponse = await response.json();
      
      if (data.success) {
        setMarkets(data.markets);
        setLastUpdate(new Date(data.timestamp).toLocaleString());
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch markets');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMarkets, 30000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Live Markets</h2>
          <p className="text-gray-400 text-sm">
            Showing markets with spread &gt; 5%
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Last updated</p>
          <p className="text-xs text-gray-500">{lastUpdate}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Market Question
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Polymarket
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Kalshi
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Spread
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {markets.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No markets with spread &gt; 5% found
                </td>
              </tr>
            ) : (
              markets.map((market) => (
                <tr
                  key={market.id}
                  className="hover:bg-[#1a1a1a] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div>
                        <p className="font-medium text-white">
                          {market.question}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <a
                            href={market.polymarket_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            View on Polymarket →
                          </a>
                          <a
                            href={market.kalshi_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            View on Kalshi →
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-lg font-semibold text-green-400">
                      {market.polymarket_price}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-lg font-semibold text-green-400">
                      {market.kalshi_price}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-lg font-bold text-yellow-400">
                        {market.spread}%
                      </span>
                      {market.is_unusual && (
                        <span className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded-full">
                          UNUSUAL
                        </span>
                      )}
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
          Unusual markets: <span className="text-red-400 font-semibold">
            {markets.filter(m => m.is_unusual).length}
          </span>
        </div>
      </div>
    </div>
  );
}
