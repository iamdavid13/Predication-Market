import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import bodyParser from 'body-parser';
import axios from 'axios';
import WSClient from './wsClient.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PORT = Number(process.env.PORT || 4002);
const POLY_WS_URL = process.env.POLY_WS_URL;
const SPREAD_ENGINE_URL = process.env.SPREAD_ENGINE_URL;
const SPREAD_INGEST_SECRET = process.env.SPREAD_INGEST_SECRET || '';

const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 20000);
const MIN_RECONNECT_MS = Number(process.env.MIN_RECONNECT_MS || 1000);
const MAX_RECONNECT_MS = Number(process.env.MAX_RECONNECT_MS || 60000);
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS || 200);
const MAX_BUFFER = Number(process.env.MAX_BUFFER || 1000);

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

// Simple health
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Hook: accepts normalized trade JSON (single trade or array). Will forward to configured SPREAD_ENGINE_URL if present.
app.post('/spread-ingest', async (req, res) => {
  try {
    const secret = req.header('x-spread-secret') || '';
    if (SPREAD_INGEST_SECRET && secret !== SPREAD_INGEST_SECRET) return res.status(403).json({ success: false, error: 'invalid secret' });

    const payload = req.body;
    if (!payload) return res.status(400).json({ success: false, error: 'missing body' });

    // forward to spread engine URL if configured
    if (SPREAD_ENGINE_URL) {
      try {
        await axios.post(SPREAD_ENGINE_URL, payload, {
          headers: { 'x-spread-secret': SPREAD_INGEST_SECRET },
          timeout: 5000,
        });
      } catch (err) {
        // log but continue
        console.error('forward error', err?.message || err);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// Basic stats endpoint
let stats = { received: 0 };
app.post('/_internal/track', (req, res) => {
  stats.received += 1;
  return res.json({ success: true, stats });
});

// Boot WS client and wire events
const wsclient = new WSClient({
  url: POLY_WS_URL,
  spreadEngineUrl: SPREAD_ENGINE_URL,
  spreadSecret: SPREAD_INGEST_SECRET,
  pingInterval: PING_INTERVAL_MS,
  minBackoff: MIN_RECONNECT_MS,
  maxBackoff: MAX_RECONNECT_MS,
  flushInterval: FLUSH_INTERVAL_MS,
  maxBuffer: MAX_BUFFER,
});

wsclient.start();

process.on('SIGINT', () => {
  try { wsclient.stop(); } catch (e) {}
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`polymarket-ws-express listening on ${PORT}`);
  console.log('POLY_WS_URL=', POLY_WS_URL);
  console.log('SPREAD_ENGINE_URL=', SPREAD_ENGINE_URL);
});
