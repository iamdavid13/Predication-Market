import WebSocket from 'ws';
import axios from 'axios';
import EventEmitter from 'events';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class PolymarketWS extends EventEmitter {
  /**
   * opts: { url, markets: [], db, spreadEngineUrl, pingInterval, minBackoff, maxBackoff }
   */
  constructor(opts = {}) {
    super();
    this.url = opts.url;
    this.markets = opts.markets || [];
    this.db = opts.db; // optional DB instance
    this.spreadEngineUrl = opts.spreadEngineUrl;

    this.pingInterval = opts.pingInterval || 20000;
    this.minBackoff = opts.minBackoff || 1000;
    this.maxBackoff = opts.maxBackoff || 60000;

    this.ws = null;
    this._shouldRun = false;
    this._backoff = this.minBackoff;
    this._pingTimer = null;
    this._subscribed = new Set();
    // in-memory dedupe map -> unique_id => timestamp
    this._dedupe = new Map();

    // write buffering to improve DB throughput
    this._writeBuffer = [];
    this._flushInterval = opts.flushInterval || 200; // ms
    this._maxBuffer = opts.maxBuffer || 1000;
    this._flushTimer = setInterval(() => this._flushWrites().catch((e) => {}), this._flushInterval);
  }

  async start() {
    this._shouldRun = true;
    while (this._shouldRun) {
      try {
        await this._connect();
        // reset backoff after a successful connection
        this._backoff = this.minBackoff;
        // wait until socket closes before attempting reconnect
        await new Promise((resolve) => (this._closeResolve = resolve));
      } catch (err) {
        console.error('ws loop error', err);
      }

      if (!this._shouldRun) break;
      // exponential backoff
      const wait = Math.min(this._backoff, this.maxBackoff);
      console.log(`Reconnecting in ${wait}ms`);
      await sleep(wait + Math.floor(Math.random() * 200));
      this._backoff = Math.min(this._backoff * 1.8, this.maxBackoff);
    }
  }

  stop() {
    this._shouldRun = false;
    if (this.ws) this.ws.terminate();
    // flush any buffered writes and clear timer
    try {
      this._flushWrites().catch(() => {});
    } catch (e) {}
    this._clearFlushTimer();
  }

  async _connect() {
    return new Promise((resolve, reject) => {
      console.log('Connecting to', this.url);
      const ws = new WebSocket(this.url, { handshakeTimeout: 15000 });
      this.ws = ws;

      let opened = false;

      ws.on('open', () => {
        opened = true;
        console.log('WS open');
        this._startHeartbeat();
        this._resubscribeAll();
        resolve();
      });

      ws.on('message', (data) => {
        this._handleMessage(data.toString());
      });

      ws.on('pong', () => {
        // received pong
      });

      ws.on('close', (code, reason) => {
        console.warn('WS closed', code, String(reason));
        this._stopHeartbeat();
        this.ws = null;
        if (this._closeResolve) this._closeResolve();
      });

      ws.on('error', (err) => {
        console.error('WS error', err?.message || err);
        if (!opened) reject(err);
      });
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._pingTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      } catch (err) {
        // ignore
      }
    }, this.pingInterval);
  }

  _clearFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  _stopHeartbeat() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  subscribeMarket(marketId) {
    if (!marketId) return;
    this.markets.push(marketId);
    this._subscribed.add(marketId);
    this._sendSubscribe(marketId);
  }

  _resubscribeAll() {
    for (const m of this._subscribed) this._sendSubscribe(m);
  }

  _sendSubscribe(marketId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Polymarket subscription message format varies; provide a generic event
    const msg = JSON.stringify({ type: 'subscribe', market: marketId });
    try {
      this.ws.send(msg);
    } catch (err) {
      // ignore
    }
  }

  async _handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // ignore non-json
      return;
    }

    // Attempt to parse trades; adapt to many message shapes
    if (parsed.type === 'trade' || parsed.event === 'trade' || parsed.op === 'trade') {
      const trade = this._parseTrade(parsed);
      if (trade) await this._processTrade(trade);
    } else if (Array.isArray(parsed)) {
      for (const msg of parsed) {
        if (msg && (msg.type === 'trade' || msg.event === 'trade')) {
          const trade = this._parseTrade(msg);
          if (trade) await this._processTrade(trade);
        }
      }
    } else {
      // Some feeds deliver trades under other keys
      if (parsed.data && Array.isArray(parsed.data)) {
        for (const d of parsed.data) {
          if (d && (d.type === 'trade' || d.event === 'trade' || d.t === 'trade')) {
            const trade = this._parseTrade(d);
            if (trade) await this._processTrade(trade);
          }
        }
      }
    }
  }

  _parseTrade(msg) {
    // Try to normalize trade messages from different shapes
    try {
      // Prefer explicit fields
      const market_id = msg.market_id || msg.market || msg.marketId || msg.instrument || msg.topic;
      const outcome = (msg.outcome || msg.sideOutcome || msg.direction || '').toString().toUpperCase();
      let priceRaw = msg.price ?? msg.p ?? msg.price_usd ?? msg.price_cents ?? 0;
      let price = Number(priceRaw || 0);
      if (msg.price_cents !== undefined && msg.price_cents !== null) {
        // price_cents is integer cents -> convert to dollars
        price = Number(msg.price_cents) / 100.0;
      }
      const size = Number(msg.size ?? msg.s ?? msg.amount ?? msg.qty ?? msg.count ?? 0);
      const side = (msg.side || msg.action || msg.taker_side || '').toString().toLowerCase() || (msg.buy ? 'buy' : msg.sell ? 'sell' : 'buy');
      const ts = Number(msg.timestamp ?? msg.ts ?? Date.now());
      // Build unique id: prefer tx_hash+log_index, fallback to id
      const unique_id = (msg.tx_hash && msg.log_index) ? `${msg.tx_hash}:${msg.log_index}` : (msg.id || msg.trade_id || msg.unique_id || `${market_id}:${ts}:${Math.random().toString(36).slice(2,8)}`);

      // Outcome normalization
      const out = outcome.startsWith('Y') || outcome === 'YES' ? 'YES' : outcome.startsWith('N') || outcome === 'NO' ? 'NO' : outcome;

      // attempt to detect source from message or URL
      let source = 'polymarket';
      if (msg.source) source = String(msg.source).toLowerCase();
      else if (msg.exchange) source = String(msg.exchange).toLowerCase();
      else if (this.url && this.url.toLowerCase().includes('kalshi')) source = 'kalshi';
      else if (this.url && this.url.toLowerCase().includes('poly')) source = 'polymarket';

      return {
        source: source,
        market_id: String(market_id || ''),
        outcome: out,
        price: Number(price),
        size: Number(size),
        side: side === 'sell' ? 'sell' : 'buy',
        timestamp: Math.floor(Number(ts)),
        unique_id: String(unique_id),
        raw: msg,
      };
    } catch (err) {
      console.error('parseTrade error', err);
      return null;
    }
  }

  async _processTrade(trade) {
    // Dedupe in-memory first
    if (!trade || !trade.unique_id) return;
    if (this._dedupe.has(trade.unique_id)) return;
    this._dedupe.set(trade.unique_id, Date.now());

    // prune dedupe map occasionally
    if (this._dedupe.size > 150000) {
      const cutoff = Date.now() - 1000 * 60 * 10; // 10 minutes
      for (const [k, ts] of this._dedupe) {
        if (ts < cutoff) this._dedupe.delete(k);
        if (this._dedupe.size <= 80000) break;
      }
    }

    // Buffer for bulk insertion
    this._enqueueTrade(trade);

    // push to spread engine hook (fire-and-forget)
    try {
      if (this.spreadEngineUrl) {
        axios.post(this.spreadEngineUrl, trade).catch((e) => console.error('spread push error', e?.message || e));
      }
    } catch (err) {
      console.error('push to spread engine error', err);
    }

    // emit locally
    try {
      this.emit('trade', trade);
    } catch (err) {
      // ignore listener errors
    }
  }

  _enqueueTrade(trade) {
    this._writeBuffer.push(trade);
    if (this._writeBuffer.length >= this._maxBuffer) {
      // flush immediately
      this._flushWrites().catch((e) => {});
    }
  }

  async _flushWrites() {
    if (!this._writeBuffer || this._writeBuffer.length === 0) return;
    const batch = this._writeBuffer.splice(0, this._writeBuffer.length);
    if (this.db && typeof this.db.bulkInsertTrades === 'function') {
      try {
        await this.db.bulkInsertTrades(batch);
      } catch (err) {
        console.error('bulkInsert error', err);
        // fallback to individual inserts
        for (const t of batch) {
          try {
            if (this.db && typeof this.db.insertTrade === 'function') await this.db.insertTrade(t);
          } catch (e) {
            // ignore per-row errors
          }
        }
      }
    } else if (this.db && typeof this.db.insertTrade === 'function') {
      // fallback: insert in parallel but don't await all to block
      for (const t of batch) {
        this.db.insertTrade(t).catch((e) => {});
      }
    }
  }
}
