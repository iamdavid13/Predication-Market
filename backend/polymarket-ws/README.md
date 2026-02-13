Polymarket WebSocket Ingestion
===============================

This module implements a Node.js WebSocket ingestion layer for Polymarket trades.

Features:
- Reliable WebSocket connection with exponential backoff reconnect
- Heartbeat pings using `ws.ping()`
- Auto-resubscribe of markets on reconnect
- Trade normalization and deduplication (in-memory + DB uniqueness)
- SQLite persistence for trades and last-seen cursor
- Hook to push trades into a spread engine (`SPREAD_ENGINE_URL`)
- Backfill worker to repair missed trades via REST

Quick start
-----------

1. Install dependencies

```
cd backend/polymarket-ws
npm install
```

2. Copy `.env.example` to `.env` and update values.

3. Run ingestion

```
npm start
```

4. Backfill a market

```
npm run backfill -- <MARKET_ID>
```

Notes
-----
- Configure `POLY_WS_URL`, `SPREAD_ENGINE_URL`, and `DB_PATH` in the `.env` file.
- `SPREAD_ENGINE_URL` should accept POST JSON trade objects; the client will POST each normalized trade to it.
