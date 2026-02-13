import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

export async function initDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      unique_id TEXT PRIMARY KEY,
      source TEXT,
      market_id TEXT,
      outcome TEXT,
      price REAL,
      size REAL,
      side TEXT,
      timestamp INTEGER,
      raw_json TEXT,
      received_at INTEGER
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS last_seen (
      market_id TEXT PRIMARY KEY,
      last_cursor TEXT,
      updated_at INTEGER
    )
  `);

  return db;
}

export async function insertTrade(db, t) {
  const sql = `INSERT OR IGNORE INTO trades (unique_id, source, market_id, outcome, price, size, side, timestamp, raw_json, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  try {
    await db.run(sql, [
      t.unique_id,
      t.source,
      t.market_id,
      t.outcome,
      t.price,
      t.size,
      t.side,
      t.timestamp,
      JSON.stringify(t.raw || {}),
      Date.now(),
    ]);
    return true;
  } catch (err) {
    console.error('insertTrade error', err);
    return false;
  }
}

export async function bulkInsertTrades(db, trades) {
  if (!Array.isArray(trades) || trades.length === 0) return 0;
  try {
    await db.exec('BEGIN TRANSACTION');
    const sql = `INSERT OR IGNORE INTO trades (unique_id, source, market_id, outcome, price, size, side, timestamp, raw_json, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const t of trades) {
      try {
        await db.run(sql, [
          t.unique_id,
          t.source,
          t.market_id,
          t.outcome,
          t.price,
          t.size,
          t.side,
          t.timestamp,
          JSON.stringify(t.raw || {}),
          Date.now(),
        ]);
      } catch (err) {
        // ignore per-row errors and continue
        console.error('bulkInsertTrades row error', err);
      }
    }
    await db.exec('COMMIT');
    return trades.length;
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (e) {
      // ignore
    }
    console.error('bulkInsertTrades error', err);
    return 0;
  }
}

export async function updateLastSeen(db, marketId, cursor) {
  try {
    await db.run(
      `INSERT INTO last_seen (market_id, last_cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT(market_id) DO UPDATE SET last_cursor=excluded.last_cursor, updated_at=excluded.updated_at`,
      [marketId, cursor, Date.now()]
    );
  } catch (err) {
    console.error('updateLastSeen error', err);
  }
}

export async function getLastSeen(db, marketId) {
  try {
    const row = await db.get(`SELECT last_cursor FROM last_seen WHERE market_id = ?`, [marketId]);
    return row ? row.last_cursor : null;
  } catch (err) {
    console.error('getLastSeen error', err);
    return null;
  }
}
