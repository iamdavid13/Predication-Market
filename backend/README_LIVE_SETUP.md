# Live Trading Setup Checklist

This checklist guides enabling live trading for the Predication-Market bot. Do NOT put secrets in source control.

1. Credentials (store securely locally)
   - `KALSHI_API_KEY` and `KALSHI_PRIVATE_KEY_PATH` (PEM file path)
   - Polymarket signing key or whatever the `pmxt` SDK requires
   - Keep all keys out of Git; use environment variables or a secrets manager

2. Required env vars (example)
   - `LIVE_TRADING=true` (enable after all tests)
   - `ADMIN_SECRET=<strong secret>`
   - `SPREAD_INGEST_SECRET=<secret for ingest>`
   - `KALSHI_API_KEY=...`
   - `KALSHI_PRIVATE_KEY_PATH=/path/to/key.pem`
   - `MAX_CHILD_ORDER_USD=50`
   - `ORDER_RATE_MS=250`
   - `MAX_ORDER_USD=250`

3. Safety checks (mandatory)
   - Run many simulated executions (`simulate=true`) and inspect `/api/order-history`.
   - Confirm `execution_adapter.py` method names match your SDK. Update if needed.
   - Confirm market identifiers used for orders are real `market_id`s (not human-readable questions).
   - Set conservative caps and monitor `/api/metrics` during dry-runs.
   - Only enable `LIVE_TRADING=true` once all checks pass.

4. Enabling live at runtime
   - Start backend with env vars set.
   - Use admin endpoint to enable live trading safely:
     `POST /api/admin/kill_switch?action=enable&secret=ADMIN_SECRET`

5. Monitoring and kill-switch
   - Keep `/api/execution/stream` open in a terminal or UI.
   - If anything looks wrong, disable live trading:
     `POST /api/admin/kill_switch?action=disable&secret=ADMIN_SECRET`

6. Post-deployment
   - Consider using a hardware wallet / HSM for signing keys.
   - Move persistence to a managed DB and add proper monitoring/alerting.

If you want, I can:
- Wire exact `pmxt` SDK method calls if you provide method signatures.
- Add a frontend confirm UI before live execute.
- Add persistent execution event logging to the DB.
