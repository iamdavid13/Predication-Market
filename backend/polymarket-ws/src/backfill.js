import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import * as dbmod from './db.js';
import { initDb } from './db.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DB_PATH = process.env.DB_PATH || './data/polymarket_trades.db';
const BACKFILL_API = process.env.BACKFILL_API || 'http://localhost:8000/api/trades';

async function backfillMarket(marketId, limit = 500) {
  const db = await initDb(DB_PATH);
  console.log('Backfilling', marketId);
  try {
    const res = await axios.get(BACKFILL_API, { params: { market_id: marketId, limit } });
    const json = res.data;
    if (!json || !Array.isArray(json.trades)) {
      console.warn('unexpected backfill payload', json);
      return;
    }
    let count = 0;
    for (const t of json.trades) {
      // Transform to normalized trade
      const trade = {
        source: 'polymarket',
        market_id: t.market || t.question || marketId,
        outcome: (t.outcome || t.side || 'YES').toString().toUpperCase(),
        price: Number(t.price || t.price_cents || 0),
        size: Number(t.size || t.amount || 0),
        side: (t.side || 'buy').toLowerCase(),
        timestamp: Date.now(),
        unique_id: t.id || `${marketId}:${t.id || Math.random().toString(36).slice(2,8)}`,
        raw: t,
      };
      const ok = await dbmod.insertTrade(db, trade);
      if (ok) count++;
    }
    console.log('Backfilled', count, 'trades for', marketId);
  } catch (err) {
    console.error('backfill error', err?.message || err);
  }
}

// CLI: node src/backfill.js MARKET_ID
if (require.main === module) {
  const market = process.argv[2];
  if (!market) {
    console.error('Usage: node backfill.js <market_id>');
    process.exit(2);
  }
  backfillMarket(market).then(() => process.exit(0)).catch(() => process.exit(1));
}
