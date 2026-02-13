import WebSocket from 'ws';
import axios from 'axios';

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export class WSClient {
  constructor(opts = {}) {
    this.url = opts.url;
    this.markets = opts.markets || [];
    this.spreadEngineUrl = opts.spreadEngineUrl;
    this.spreadSecret = opts.spreadSecret || '';

    this.pingInterval = opts.pingInterval || 20000;
    this.minBackoff = opts.minBackoff || 1000;
    this.maxBackoff = opts.maxBackoff || 60000;
    this.flushInterval = opts.flushInterval || 200;
    this.maxBuffer = opts.maxBuffer || 1000;

    this.ws = null;
    this._shouldRun = false;
    this._backoff = this.minBackoff;

    // dedupe map and write buffer
    this._dedupe = new Map();
    this._writeBuffer = [];
    this._flushTimer = null;
  }

  start() {
    if (this._shouldRun) return;
    this._shouldRun = true;
    this._flushTimer = setInterval(() => this._flushWrites().catch(() => {}), this.flushInterval);
    this._runLoop();
  }

  stop() {
    this._shouldRun = false;
    if (this.ws) this.ws.terminate();
    if (this._flushTimer) clearInterval(this._flushTimer);
    // flush remaining
    this._flushWrites().catch(() => {});
  }

  async _runLoop() {
    while (this._shouldRun) {
      try {
        await this._connect();
        this._backoff = this.minBackoff;
        // wait until closed
        await new Promise((resolve) => (this._closeResolve = resolve));
      } catch (err) {
        console.error('ws loop error', err?.message || err);
      }

      if (!this._shouldRun) break;
      const wait = Math.min(this._backoff, this.maxBackoff);
      await sleep(wait + Math.floor(Math.random() * 200));
      this._backoff = Math.min(this._backoff * 1.8, this.maxBackoff);
    }
  }

  async _connect() {
    return new Promise((resolve, reject) => {
      console.log('connecting to', this.url);
      const ws = new WebSocket(this.url);
      this.ws = ws;

      let opened = false;
      ws.on('open', () => {
        opened = true;
        console.log('ws open');
        this._startHeartbeat();
        this._resubscribe();
        resolve();
      });

      ws.on('message', (data) => {
        this._handleMessage(data.toString());
      });

      ws.on('pong', () => {});

      ws.on('close', (code, reason) => {
        console.warn('ws closed', code, String(reason));
        this._stopHeartbeat();
        this.ws = null;
        if (this._closeResolve) this._closeResolve();
      });

      ws.on('error', (err) => {
        console.error('ws error', err?.message || err);
        if (!opened) reject(err);
      });
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._hb = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.ping();
      } catch (e) {}
    }, this.pingInterval);
  }

  _stopHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
  }

  _resubscribe() {
    for (const m of this.markets) this._sendSubscribe(m);
  }

  _sendSubscribe(marketId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type: 'subscribe', market: marketId }));
    } catch (e) {}
  }

  async _handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return;
    }

    // Try to find trade objects - support array or single
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const it of items) {
      if (!it) continue;
      if (it.type === 'trade' || it.event === 'trade' || (it.data && it.data.type === 'trade')) {
        const t = this._parseTrade(it);
        if (t) this._processTrade(t).catch(() => {});
      } else if (it.data && Array.isArray(it.data)) {
        for (const d of it.data) {
          const t = this._parseTrade(d);
          if (t) this._processTrade(t).catch(() => {});
        }
      }
    }
  }

  _parseTrade(msg) {
    try {
      const market_id = msg.market_id || msg.market || msg.marketId || msg.instrument || msg.topic || msg.topic_id || msg.topicId;
      const outRaw = msg.outcome || msg.sideOutcome || msg.direction || '';
      const outcome = String(outRaw).toUpperCase();

      let price = 0;
      if (msg.price_cents !== undefined && msg.price_cents !== null) price = Number(msg.price_cents) / 100.0;
      else price = Number(msg.price ?? msg.p ?? msg.price_usd ?? 0) || 0;

      const size = Number(msg.size ?? msg.s ?? msg.amount ?? msg.qty ?? 0) || 0;
      const side = String(msg.side || msg.action || (msg.buy ? 'buy' : msg.sell ? 'sell' : 'buy')).toLowerCase();
      const ts = Number(msg.timestamp ?? msg.ts ?? Date.now());
      const unique_id = msg.tx_hash && msg.log_index ? `${msg.tx_hash}:${msg.log_index}` : (msg.id || msg.trade_id || `${market_id}:${ts}:${Math.random().toString(36).slice(2,8)}`);

      const src = msg.source || msg.exchange || (this.url && this.url.includes('kalshi') ? 'kalshi' : 'polymarket');

      return {
        source: String(src).toLowerCase(),
        market_id: String(market_id || ''),
        outcome: outcome.startsWith('Y') ? 'YES' : outcome.startsWith('N') ? 'NO' : outcome,
        price: Number(price),
        size: Number(size),
        side: side === 'sell' ? 'sell' : 'buy',
        timestamp: Math.floor(Number(ts)),
        unique_id: String(unique_id),
        raw: msg,
      };
    } catch (e) {
      return null;
    }
  }

  async _processTrade(trade) {
    if (!trade || !trade.unique_id) return;
    if (this._dedupe.has(trade.unique_id)) return;
    this._dedupe.set(trade.unique_id, Date.now());
    if (this._dedupe.size > 150000) {
      // prune older
      const cutoff = Date.now() - 1000 * 60 * 10;
      for (const [k, ts] of this._dedupe) {
        if (ts < cutoff) this._dedupe.delete(k);
        if (this._dedupe.size <= 80000) break;
      }
    }

    // buffer for batched posting
    this._writeBuffer.push(trade);

    if (this._writeBuffer.length >= this.maxBuffer) await this._flushWrites();
  }

  async _flushWrites() {
    if (!this._writeBuffer || this._writeBuffer.length === 0) return;
    const batch = this._writeBuffer.splice(0, this._writeBuffer.length);
    // forward each trade to the spread engine, but do it in a single POST when possible
    try {
      if (this.spreadEngineUrl) {
        const headers = {};
        if (this.spreadSecret) headers['x-spread-secret'] = this.spreadSecret;
        // send as an array payload to allow the engine to handle batch
        await axios.post(this.spreadEngineUrl, batch.length === 1 ? batch[0] : batch, { timeout: 5000, headers }).catch(() => {});
      }
    } catch (e) {
      console.error('flush post error', e?.message || e);
    }
  }
}

export default WSClient;
