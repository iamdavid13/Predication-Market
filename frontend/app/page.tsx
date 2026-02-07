import MarketsTable from '../components/MarketsTable';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                UnusualProbs
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Prediction Market Aggregator
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-3 py-1 bg-green-900/20 border border-green-900 rounded-full text-xs text-green-400 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Live
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">SPREAD THRESHOLD</h3>
            <p className="text-2xl font-bold text-white">&gt; 5%</p>
            <p className="text-xs text-gray-500 mt-1">Minimum spread shown</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">UNUSUAL THRESHOLD</h3>
            <p className="text-2xl font-bold text-red-400">&gt; 10%</p>
            <p className="text-xs text-gray-500 mt-1">Flagged as unusual</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">UPDATE FREQUENCY</h3>
            <p className="text-2xl font-bold text-blue-400">30s</p>
            <p className="text-xs text-gray-500 mt-1">Auto-refresh interval</p>
          </div>
        </div>

        {/* Markets Table */}
        <MarketsTable />

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
