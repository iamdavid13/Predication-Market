"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { getApiBaseUrl } from "../../lib/api";

type Market = {
  id: string;
  question: string;
  polymarket_price: number;
  kalshi_price: number;
  spread: number;
  is_unusual: boolean;
};

type Trade = {
  id: string;
  market: string;
  exchange: string;
  price: number;
  size?: number;
  ts?: string;
};

function formatPrice(p: number | undefined) {
  return typeof p === "number" ? (p / 100).toFixed(3) : "-";
}

export default function PolymarketBotPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [spreads, setSpreads] = useState<any[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [intervalMs, setIntervalMs] = useState(10000);
  const [minSpreadPct, setMinSpreadPct] = useState(0.05); // 5% default
  const [useSse, setUseSse] = useState(true);
  const [autoExecute, setAutoExecute] = useState(false);
  const [autoMode, setAutoMode] = useState<'simulate' | 'live'>('simulate');
  const lastAutoExec = useRef<Record<string, number>>({});
  const [execEvents, setExecEvents] = useState<any[]>([]);

  const apiBase = getApiBaseUrl();
  const lastMarketsJson = useRef<string | null>(null);
  const evtRef = useRef<EventSource | null>(null);

  // Efficient polling: only set state when payload changes
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`${apiBase}/api/markets`);
        const json = await res.json();
        const payload = JSON.stringify(json.markets || []);
        if (!mounted) return;
        if (payload !== lastMarketsJson.current) {
          lastMarketsJson.current = payload;
          setMarkets((json.markets || []).filter((m: Market) => (m.spread / 100) >= minSpreadPct));
        }
      } catch (err) {
        console.error("Failed to load markets", err);
      } finally {
        setLoading(false);
      }
    }

    load();
    const poll = setInterval(load, intervalMs);
    return () => {
      mounted = false;
      clearInterval(poll);
    };
  }, [apiBase, intervalMs, minSpreadPct]);

  // Poll spreads endpoint separately (trade-level spreads)
  useEffect(() => {
    let mounted = true;

    async function loadSpreads() {
      try {
        const res = await fetch(`${apiBase}/api/spreads?min_spread_pct=${minSpreadPct}`);
        const json = await res.json();
        if (!mounted) return;
        setSpreads(json.spreads || []);
      } catch (err) {
        console.error("loadSpreads", err);
      }
    }

    loadSpreads();
    const t = setInterval(loadSpreads, Math.max(5000, intervalMs));
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [apiBase, intervalMs, minSpreadPct]);

  // Trade preview / execute helpers
  async function previewTrade(spreadKey: string) {
    try {
      const res = await fetch(`${apiBase}/api/trade/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spread_key: spreadKey, side: "buy" }),
      });
      return await res.json();
    } catch (err) {
      console.error("previewTrade", err);
      return { success: false, error: String(err) };
    }
  }

  async function executeTrade(spreadKey: string, simulate: boolean = true) {
    try {
      const res = await fetch(`${apiBase}/api/trade/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spread_key: spreadKey, side: "buy", size_usd: 50, simulate }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Order recorded: ${json.order.id} (simulate=${json.order.simulate})`);
      } else {
        alert(`Execute failed: ${json.error}`);
      }
      return json;
    } catch (err) {
      console.error("executeTrade", err);
      alert(`Execute error: ${String(err)}`);
      return { success: false, error: String(err) };
    }
  }

  async function executeTradeLive(spreadKey: string, simulate: boolean) {
    if (!simulate) {
      const ok = confirm('Are you sure you want to execute LIVE trades? This will attempt real orders if the backend is enabled.');
      if (!ok) return { success: false, error: 'user_cancel' };
    }
    return await executeTrade(spreadKey, simulate);
  }

  // SSE connection (optional)
  useEffect(() => {
    if (!useSse) return;
    const url = `${apiBase}/api/trades/stream?limit=200`;
    const es = new EventSource(url);
    evtRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.trades && Array.isArray(payload.trades)) {
          setTrades((prev) => {
            const merged = [...payload.trades, ...prev];
            // de-duplicate by id
            const seen = new Set<string>();
            const dedup: Trade[] = [];
            for (const t of merged) {
              if (!t || !t.id) continue;
              if (seen.has(t.id)) continue;
              seen.add(t.id);
              dedup.push(t);
              if (dedup.length >= 500) break;
            }
            return dedup;
          });
        }
      } catch (err) {
        // ignore
      }
    };

    return () => {
      es.close();
      evtRef.current = null;
      setSseConnected(false);
    };
  }, [apiBase, useSse]);

  // Execution events SSE
  useEffect(() => {
    const url = `${apiBase}/api/execution/stream`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setExecEvents((prev) => [payload, ...prev].slice(0, 200));
      } catch (err) {}
    };
    return () => es.close();
  }, [apiBase]);

  // Auto-execute logic: monitor spreads and trigger execute when conditions met
  useEffect(() => {
    if (!autoExecute) return;
    let mounted = true;

    async function tryAuto() {
      if (!mounted) return;
      try {
        if (!spreads || spreads.length === 0) return;
        const top = spreads[0];
        const spreadPct = top.spread_pct ?? top.spread ?? 0;
        const key = top.key || top.id || top.question;
        const now = Date.now();
        const last = lastAutoExec.current[key] || 0;
        // cooldown 30s per market
        if (now - last < 30000) return;
        if (spreadPct >= minSpreadPct) {
          // trigger execution based on mode
          const simulate = autoMode === 'simulate';
          const res = await executeTradeLive(key, simulate);
          if (res && res.success) {
            lastAutoExec.current[key] = Date.now();
          }
        }
      } catch (err) {
        // ignore
      }
    }

    const id = setInterval(tryAuto, Math.max(2000, intervalMs));
    // run immediate
    tryAuto();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [autoExecute, autoMode, spreads, minSpreadPct, intervalMs]);

  // Metrics
  const metrics = useMemo(() => {
    if (!markets || markets.length === 0) return { maxSpread: 0, avgSpread: 0, unusual: 0 };
    const spreads = markets.map((m) => m.spread / 100);
    const maxSpread = Math.max(...spreads);
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const unusual = markets.filter((m) => m.is_unusual).length;
    return { maxSpread, avgSpread, unusual };
  }, [markets]);

  return (
    <div className="min-h-screen bg-[#050505] text-white py-8 px-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold">Polymarket Bot</h2>
            <p className="text-sm text-gray-400">Scanning markets and collecting spreads across Polymarket & Kalshi.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">SSE: <span className={sseConnected ? 'text-green-400' : 'text-red-400'}>{useSse ? (sseConnected ? 'Connected' : 'Disconnected') : 'Disabled'}</span></div>
            <div className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-md px-3 py-2 text-sm text-gray-300">
              <div>Top: <span className="font-semibold text-white">{metrics.maxSpread.toFixed(2)}%</span></div>
              <div className="text-xs text-gray-500">Avg: {metrics.avgSpread.toFixed(2)}% • Unusual: {metrics.unusual}</div>
            </div>
            <div className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-md px-3 py-2 text-sm text-gray-300">
              <label className="text-xs text-gray-400">Auto Execute</label>
              <div className="flex items-center gap-2 mt-1">
                <select value={autoMode} onChange={(e) => setAutoMode(e.target.value as any)} className="bg-[#0b0b0b] border border-[#222] rounded px-2 py-1 text-sm">
                  <option value="simulate">Auto (Simulate)</option>
                  <option value="live">Auto (Live)</option>
                </select>
                <button onClick={() => setAutoExecute((v) => !v)} className={`px-2 py-1 rounded text-xs ${autoExecute ? 'bg-red-600 text-white' : 'bg-green-700 text-white'}`}>
                  {autoExecute ? 'Stop Auto' : 'Start Auto'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-400">Scan interval:</label>
          <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} className="bg-[#0b0b0b] border border-[#222] rounded px-2 py-1 text-sm">
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
          </select>

          <label className="text-sm text-gray-400">Min spread %:</label>
          <input type="number" step="0.1" min={0} max={100} value={minSpreadPct * 100} onChange={(e) => setMinSpreadPct(Number(e.target.value) / 100)} className="w-20 bg-[#0b0b0b] border border-[#222] rounded px-2 py-1 text-sm" />

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={useSse} onChange={(e) => setUseSse(e.target.checked)} /> Use SSE
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-lg p-4">
            <h3 className="font-semibold mb-3">Top Spreads</h3>
            {loading ? (
              <div className="text-gray-500">Loading markets…</div>
            ) : (
              <div className="space-y-3">
                {spreads.length > 0 && (
                  <div className="mb-3 text-sm text-gray-400">Showing trade-level spreads: {spreads.length}</div>
                )}
                {markets.length === 0 && <div className="text-gray-500">No markets found (raise min spread or wait).</div>}
                {markets.slice(0, 50).map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-[#070707] to-[#0f0f0f] rounded-md border border-[#222] hover:scale-[1.01] transition-transform">
                    <div className="min-w-0 pr-4">
                      <div className="text-sm text-gray-300 truncate">{m.question}</div>
                      <div className="text-xs text-gray-500 truncate">{m.id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">PM: {formatPrice(m.polymarket_price)}</div>
                      <div className="text-sm font-mono">K: {formatPrice(m.kalshi_price)}</div>
                      <div className={`text-sm mt-1 font-semibold ${m.is_unusual ? 'text-pink-400' : 'text-gray-300'}`}>Spread: {(m.spread / 100).toFixed(2)}%</div>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          onClick={async () => {
                            const p = await previewTrade(m.id);
                            if (p && p.success) {
                              alert(`Preview:\nprice: ${p.preview.price}\nsize: ${p.preview.size_usd}`);
                            } else {
                              alert(`Preview failed: ${p.error}`);
                            }
                          }}
                          className="text-xs px-2 py-1 bg-[#111] border border-[#222] rounded text-gray-300 hover:bg-[#161616]"
                        >
                          Preview
                        </button>
                        <button
                          onClick={async () => {
                            const ok = confirm('Execute simulated order for this spread? (will not place live order unless LIVE_TRADING=true)');
                            if (!ok) return;
                            await executeTradeLive(m.id, true);
                          }}
                          className="text-xs px-2 py-1 bg-green-600 rounded text-white hover:brightness-90"
                        >
                          Execute (Sim)
                        </button>
                        <button
                          onClick={async () => {
                            const ok = confirm('Execute LIVE order for this spread? Ensure you have enabled live trading and understand risks.');
                            if (!ok) return;
                            await executeTradeLive(m.id, false);
                          }}
                          className="text-xs px-2 py-1 bg-red-600 rounded text-white hover:brightness-90"
                        >
                          Execute (Live)
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-lg p-4">
            <h3 className="font-semibold mb-3">Live Trades (aggregated)</h3>
            <div className="h-[560px] overflow-auto space-y-2">
              {trades.length === 0 && <div className="text-gray-500">No live trades yet.</div>}
              {trades.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-md bg-[#070707] border border-[#222] text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.market}</div>
                    <div className="text-xs text-gray-500">{t.exchange} • {t.id}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-white">{formatPrice(t.price)}</div>
                    {t.size && <div className="text-xs text-gray-500">{t.size}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-lg p-4">
            <h3 className="font-semibold mb-3">Execution Events</h3>
            <div className="h-48 overflow-auto text-xs space-y-2">
              {execEvents.length === 0 && <div className="text-gray-500">No execution events yet.</div>}
              {execEvents.map((e, i) => (
                <div key={i} className="p-2 rounded border border-[#222] bg-[#070707]">
                  <div className="text-[11px] text-gray-400">{e.type} • {e.ts || ''}</div>
                  <pre className="text-[12px] mt-1 whitespace-pre-wrap">{JSON.stringify(e, null, 2)}</pre>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[#0b0b0b] border border-[#1f1f1f] rounded-lg p-4">
            <h3 className="font-semibold mb-3">Auto-Execution Controls</h3>
            <div className="text-sm text-gray-300">
              <div>Mode: <span className="font-medium">{autoMode}</span></div>
              <div>Auto running: <span className={`font-medium ${autoExecute ? 'text-green-400' : 'text-red-400'}`}>{autoExecute ? 'Yes' : 'No'}</span></div>
              <div className="mt-2 text-xs text-gray-400">Auto-exec will attempt to take the top spread when it meets the configured min spread and cooldown.</div>
              <div className="mt-3">
                <button onClick={() => { setAutoExecute(true); alert('Auto-execution started'); }} className="px-3 py-1 bg-green-600 rounded text-white mr-2">Start Auto</button>
                <button onClick={() => { setAutoExecute(false); alert('Auto-execution stopped'); }} className="px-3 py-1 bg-red-600 rounded text-white">Stop Auto</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
