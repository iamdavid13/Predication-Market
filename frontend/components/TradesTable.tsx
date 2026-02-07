'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../lib/api';

interface Trade {
  id: string;
  market: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
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

export default function TradesTable() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const fetchTrades = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/trades`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        setTrades(data.trades);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch trades');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (value: string) => {
    const date = new Date(value);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-900 rounded-lg p-6 text-center">
        <p className="text-red-400">⚠️ {error}</p>
        <button
          onClick={fetchTrades}
          className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/70 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
        <table className="w-full">
          <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Market
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Side
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Exchange
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No trades yet
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr key={trade.id} className="hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{trade.market}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
                        trade.side === 'buy'
                          ? 'text-green-400 border-green-900 bg-green-900/20'
                          : 'text-red-400 border-red-900 bg-red-900/20'
                      }`}
                    >
                      {trade.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-white font-semibold">
                    {trade.price}%
                  </td>
                  <td className="px-6 py-4 text-center text-gray-300">
                    {trade.size}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-300">
                    {trade.exchange}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-400">
                    {formatTime(trade.trade_time)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
