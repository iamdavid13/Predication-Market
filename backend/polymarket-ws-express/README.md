# Polymarket WS Express Ingestion

This small service connects to a Polymarket WebSocket, normalizes trade messages, and forwards them to a spread engine endpoint.

Quick start

1. Copy `.env.example` to `.env` and edit values.
2. Install deps and run:

```bash
cd backend/polymarket-ws-express
npm install
node src/server.js
```

Configuration
- `POLY_WS_URL` - WebSocket URL for Polymarket
- `SPREAD_ENGINE_URL` - Backend endpoint that accepts normalized trades (e.g., `http://localhost:8000/api/spread-ingest`)
- `SPREAD_INGEST_SECRET` - Optional secret header to protect ingest endpoint
- `PORT` - Express listen port

Notes
- The client buffers and posts trades in small batches for throughput.
- The service will not post batches if `SPREAD_ENGINE_URL` is unset.
- For production, run under a process manager and use a persistent database.
