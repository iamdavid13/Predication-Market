'use client'

import { useState, useEffect } from 'react'

interface Market {
  title: string
  polymarket_price: number
  kalshi_price: number
  spread: number
  similarity_score: number
}

interface MarketData {
  markets: Market[]
  last_update: string | null
  status: string
  count: number
}

export default function Home() {
  const [marketData, setMarketData] = useState<MarketData>({
    markets: [],
    last_update: null,
    status: 'loading',
    count: 0
  })
  const [error, setError] = useState<string | null>(null)

  const fetchMarkets = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/markets`)
      if (!response.ok) {
        throw new Error('Failed to fetch markets')
      }
      const data = await response.json()
      setMarketData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Error fetching markets:', err)
    }
  }

  useEffect(() => {
    // Initial fetch
    fetchMarkets()

    // Set up polling every 5 seconds for live updates
    const interval = setInterval(fetchMarkets, 5000)

    return () => clearInterval(interval)
  }, [])

  const getRowClassName = (spread: number) => {
    if (spread > 8) {
      return 'bg-red-950/30 border-neon-red/40 text-neon-red'
    } else if (spread > 3) {
      return 'bg-emerald-950/30 border-emerald-green/40 text-emerald-green'
    }
    return 'bg-zinc-900/50 border-zinc-800'
  }

  const getSpreadClassName = (spread: number) => {
    if (spread > 8) {
      return 'text-neon-red font-bold'
    } else if (spread > 3) {
      return 'text-emerald-green font-semibold'
    }
    return 'text-zinc-400'
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Unusual<span className="text-emerald-500">Probs</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Real-time prediction market arbitrage tracker
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              marketData.status === 'success' ? 'bg-emerald-950/30 border-emerald-500/40' : 
              marketData.status === 'error' ? 'bg-red-950/30 border-red-500/40' : 
              'bg-zinc-800/50 border-zinc-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                marketData.status === 'success' ? 'bg-emerald-500 animate-pulse' : 
                marketData.status === 'error' ? 'bg-red-500' : 
                'bg-zinc-500'
              }`}></div>
              <span className="text-sm text-zinc-300 capitalize">{marketData.status}</span>
            </div>
            {marketData.last_update && (
              <span className="text-sm text-zinc-500">
                Last updated: {new Date(marketData.last_update).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mb-6 flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-neon-red"></div>
            <span className="text-zinc-400">High Divergence (&gt;8%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-green"></div>
            <span className="text-zinc-400">Arbitrage Opportunity (&gt;3%)</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-500/40 rounded-lg text-red-400">
            Error: {error}
          </div>
        )}

        {/* Markets Table */}
        <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="text-left py-4 px-6 text-zinc-400 font-semibold text-sm uppercase tracking-wider">
                    Market Title
                  </th>
                  <th className="text-right py-4 px-6 text-zinc-400 font-semibold text-sm uppercase tracking-wider">
                    Polymarket
                  </th>
                  <th className="text-right py-4 px-6 text-zinc-400 font-semibold text-sm uppercase tracking-wider">
                    Kalshi
                  </th>
                  <th className="text-right py-4 px-6 text-zinc-400 font-semibold text-sm uppercase tracking-wider">
                    Spread
                  </th>
                </tr>
              </thead>
              <tbody>
                {marketData.markets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-zinc-500">
                      {marketData.status === 'loading' ? 'Loading markets...' : 'No markets found'}
                    </td>
                  </tr>
                ) : (
                  marketData.markets.map((market, index) => (
                    <tr
                      key={index}
                      className={`border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30 ${getRowClassName(market.spread)}`}
                    >
                      <td className="py-4 px-6">
                        <div className="text-white font-medium">{market.title}</div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Match confidence: {market.similarity_score}%
                        </div>
                      </td>
                      <td className="text-right py-4 px-6">
                        <span className="text-lg font-mono text-zinc-200">
                          {market.polymarket_price.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-4 px-6">
                        <span className="text-lg font-mono text-zinc-200">
                          {market.kalshi_price.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-4 px-6">
                        <span className={`text-xl font-mono font-bold ${getSpreadClassName(market.spread)}`}>
                          {market.spread.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-6 flex justify-between items-center text-sm text-zinc-500">
          <div>
            Showing <span className="text-white font-semibold">{marketData.count}</span> matched markets
          </div>
          <div>
            Polymarket × Kalshi
          </div>
        </div>
      </div>
    </main>
  )
}
