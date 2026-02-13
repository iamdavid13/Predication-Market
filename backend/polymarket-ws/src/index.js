import dotenv from 'dotenv';
import path from 'path';
import { PolymarketWS } from './wsClient.js';
import * as dbmod from './db.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const POLY_WS_URL = process.env.POLY_WS_URL || 'wss://api.polymarket.com/ws';
const DB_PATH = process.env.DB_PATH || './data/polymarket_trades.db';
const SPREAD_ENGINE_URL = process.env.SPREAD_ENGINE_URL || null;
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 20000);
const MIN_RECONNECT_MS = Number(process.env.MIN_RECONNECT_MS || 1000);
const MAX_RECONNECT_MS = Number(process.env.MAX_RECONNECT_MS || 60000);
const LIVE_MARKETS = (process.env.LIVE_MARKETS || '').split(',').map(s => s.trim()).filter(Boolean);

async function main() {
  const db = await dbmod.initDb(DB_PATH);

  const client = new PolymarketWS({
    url: POLY_WS_URL,
    markets: LIVE_MARKETS,
    db: {
      insertTrade: (t) => dbmod.insertTrade(db, t),
      bulkInsertTrades: (arr) => dbmod.bulkInsertTrades(db, arr),
      updateLastSeen: (m, c) => dbmod.updateLastSeen(db, m, c),
      getLastSeen: (m) => dbmod.getLastSeen(db, m),
    },
    spreadEngineUrl: SPREAD_ENGINE_URL,
    pingInterval: PING_INTERVAL_MS,
    minBackoff: MIN_RECONNECT_MS,
    maxBackoff: MAX_RECONNECT_MS,
  });

  client.on('trade', (t) => {
    console.log('trade:', t.market_id, t.outcome, t.price, t.size, t.unique_id);
  });

  for (const m of LIVE_MARKETS) client.subscribeMarket(m);

  process.on('SIGINT', () => {
    console.log('SIGINT, stopping');
    client.stop();
    process.exit(0);
  });

  await client.start();
}

main().catch((err) => {
  console.error('main error', err);
  process.exit(1);
});
