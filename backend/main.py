import os
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime
import sqlite3
import uuid
from typing import Optional
from execution_adapter import place_order as ea_place_order
import json as _json

# In-memory execution event pubsub for realtime monitoring (SSE clients)
EXECUTION_SUBSCRIBERS: list = []  # list of asyncio.Queue

def _publish_execution_event(ev: Dict[str, Any]):
    """Publish an execution event to all connected SSE subscribers (best-effort)."""
    # persist event (best-effort)
    try:
        _persist_execution_event(ev)
    except Exception:
        pass

    for q in list(EXECUTION_SUBSCRIBERS):
        try:
            q.put_nowait(ev)
        except Exception:
            # if subscriber queue is full or closed, ignore
            pass


def _persist_execution_event(ev: Dict[str, Any]):
    try:
        conn = DB_CONN
        if conn is None:
            return
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO execution_events (id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                ev.get('type') or 'event',
                str(ev),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
    except Exception:
        pass

# Load environment variables
load_dotenv()

# Try to import pmxt, fall back to mock data if not available
try:
    from pmxt_integration import PMXTDataFetcher
    USE_REAL_API = True
except ImportError:
    from mock_data import generate_mock_markets
    USE_REAL_API = False

app = FastAPI(title="UnusualProbs API")

# --- Simple SQLite persistence (local file) ---
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

def init_db(path: str = DB_PATH):
    conn = sqlite3.connect(path, check_same_thread=False)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS spreads (
        id TEXT PRIMARY KEY,
        spread_key TEXT,
        question TEXT,
        polymarket_price REAL,
        kalshi_price REAL,
        spread_pct REAL,
        pm_trades INTEGER,
        kx_trades INTEGER,
        last_ts TEXT,
        recorded_at TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        source TEXT,
        market_id TEXT,
        outcome TEXT,
        price REAL,
        size REAL,
        side TEXT,
        timestamp INTEGER,
        unique_id TEXT,
        raw_json TEXT,
        recorded_at TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        spread_key TEXT,
        question TEXT,
        side TEXT,
        size_usd REAL,
        price REAL,
        status TEXT,
        simulate INTEGER,
        created_at TEXT,
        details TEXT
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS execution_events (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        payload TEXT,
        created_at TEXT
    )
    """)
    conn.commit()
    return conn

DB_CONN: Optional[sqlite3.Connection] = None

# In-memory best-price index used for fast spread detection
# Structure: { key: { 'polymarket': {price, ts}, 'kalshi': {price, ts} } }
BEST_PRICES: Dict[str, Dict[str, Any]] = {}

# Config: secret for spread-ingest (node ws will post trades to this endpoint)
SPREAD_INGEST_SECRET = os.getenv('SPREAD_INGEST_SECRET', '')
# Runtime toggle for live trading (can be changed via admin endpoint)
ALLOW_LIVE = os.getenv('LIVE_TRADING', 'false').lower() == 'true'
ADMIN_SECRET = os.getenv('ADMIN_SECRET', '')



# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PMXT fetcher if available
if USE_REAL_API:
    data_fetcher = PMXTDataFetcher(
        kalshi_api_key=os.getenv('KALSHI_API_KEY'),
        kalshi_private_key_path=os.getenv('KALSHI_PRIVATE_KEY_PATH')
    )


@app.on_event("startup")
async def startup_event():
    """Start WS consumers on boot so trades stream immediately."""
    global DB_CONN
    # Initialize DB connection
    try:
        DB_CONN = init_db()
    except Exception:
        DB_CONN = None

    if USE_REAL_API:
        await data_fetcher._ensure_kalshi_ws()
        await data_fetcher._ensure_poly_ws()


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Welcome to UnusualProbs API",
        "version": "1.0.0",
        "description": "Prediction market aggregator for Polymarket and Kalshi"
    }


@app.get("/api/markets")
async def get_markets() -> Dict[str, Any]:
    """
    Fetch matched markets from Polymarket and Kalshi with spread > 5%.
    Returns markets with calculated spreads and unusual flags.
    """
    try:
        if USE_REAL_API:
            # Fetch markets using pmxt
            markets = await data_fetcher.fetch_markets(limit=50)
        else:
            # Use mock data for demonstration
            markets = generate_mock_markets()
        
        return {
            "success": True,
            "count": len(markets),
            "markets": markets,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "markets": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat()
        }


@app.get("/api/trades")
async def get_trades(market_id: str = None, limit: int = 50, exchange: str = None) -> Dict[str, Any]:
    """
    Fetch recent trades from both platforms.
    
    Args:
        market_id: Optional market ID to filter trades
        limit: Maximum number of trades to return (default 50)
        exchange: Optional exchange filter ('Kalshi' or 'Polymarket')
    """
    try:
        if USE_REAL_API:
            trades = await data_fetcher.fetch_recent_trades(market_id, limit, exchange=exchange)
        else:
            # Mock trades for demonstration
            trades = []
        
        return {
            "success": True,
            "count": len(trades),
            "trades": trades,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "trades": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat()
        }


@app.get("/api/all-markets")
async def get_all_markets(source: str = "all", limit: int = 1500) -> Dict[str, Any]:
    """
    Fetch all individual markets from Polymarket and/or Kalshi.
    Unlike /api/markets which only returns cross-platform matches,
    this returns every market with full details.
    
    Args:
        source: 'polymarket', 'kalshi', or 'all' (default 'all')
        limit: Max markets per platform (default 1500)
    """
    try:
        if USE_REAL_API:
            markets = await data_fetcher.fetch_all_markets(source=source, limit=limit)
        else:
            markets = generate_mock_markets()
        
        return {
            "success": True,
            "count": len(markets),
            "markets": markets,
            "source": source,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "markets": [],
            "count": 0,
            "source": source,
            "timestamp": datetime.utcnow().isoformat()
        }


@app.get("/api/whales")
async def get_whales(limit: int = 30) -> Dict[str, Any]:
    """
    Fetch top traders / whale leaderboard from Polymarket.
    
    Args:
        limit: Max number of traders to return (default 30)
    """
    try:
        if USE_REAL_API:
            traders = await data_fetcher.fetch_leaderboard(limit=limit)
        else:
            traders = []
        
        return {
            "success": True,
            "count": len(traders),
            "traders": traders,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traders": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat()
        }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/metrics")
async def metrics():
    """Return lightweight monitoring metrics from the local DB."""
    try:
        conn = DB_CONN
        if conn is None:
            return {"success": False, "error": "DB not available", "metrics": {}}
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM trades")
        trades_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM spreads")
        spreads_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM orders")
        orders_count = cur.fetchone()[0]
        return {"success": True, "metrics": {"trades": trades_count, "spreads": spreads_count, "orders": orders_count}, "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        return {"success": False, "error": str(e), "metrics": {}}


@app.post("/api/admin/kill_switch")
async def admin_kill_switch(action: str, secret: str = None):
    """Admin endpoint to enable/disable live trading at runtime. Requires `ADMIN_SECRET` env var to be set and provided."""
    global ALLOW_LIVE
    try:
        if not ADMIN_SECRET:
            return {"success": False, "error": "ADMIN_SECRET not configured"}
        if secret != ADMIN_SECRET:
            return {"success": False, "error": "invalid admin secret"}
        if action not in ("enable", "disable"):
            return {"success": False, "error": "action must be 'enable' or 'disable'"}
        ALLOW_LIVE = True if action == "enable" else False
        return {"success": True, "allow_live": ALLOW_LIVE}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/admin/status")
async def admin_status(secret: str = None):
    if ADMIN_SECRET and secret != ADMIN_SECRET:
        return {"success": False, "error": "invalid admin secret"}
    return {"success": True, "allow_live": ALLOW_LIVE, "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/stats")
async def get_stats():
    """Return live telemetry: WS health, trade counts, buffer size, uptime."""
    if not USE_REAL_API:
        return {"success": True, "kalshi_ws": {"enabled": False}, "poly_ws": {"enabled": False}, "timestamp": datetime.utcnow().isoformat()}

    return {
        "success": True,
        "kalshi_ws": {
            "enabled": data_fetcher.enable_kalshi_ws,
            "connected": data_fetcher.kalshi_ws_connected,
            "total_trades": data_fetcher.kalshi_ws_total_trades,
            "buffer_size": len(data_fetcher.kalshi_ws_buffer),
            "last_trade_ts": data_fetcher.kalshi_ws_last_trade_ts,
            "reconnects": data_fetcher.kalshi_ws_reconnects,
            "tickers_cached": len(data_fetcher.kalshi_ticker_cache),
        },
        "poly_ws": {
            "enabled": data_fetcher.enable_poly_ws,
            "connected": data_fetcher.poly_ws_connected,
            "total_trades": data_fetcher.poly_ws_total_trades,
            "buffer_size": len(data_fetcher.poly_ws_buffer),
            "last_trade_ts": data_fetcher.poly_ws_last_trade_ts,
            "reconnects": data_fetcher.poly_ws_reconnects,
            "tokens_cached": len(data_fetcher.poly_token_cache),
        },
        "started_at": data_fetcher._started_at,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/trades/stream")
async def stream_trades(limit: int = 20):
    """Server-Sent Events endpoint that pushes fresh trades every few seconds."""
    import asyncio
    import json as _json
    from starlette.responses import StreamingResponse

    async def event_generator():
        seen_ids: set = set()
        while True:
            try:
                if USE_REAL_API:
                    trades = await data_fetcher.fetch_recent_trades(limit=limit)
                else:
                    trades = []
                fresh = [t for t in trades if t["id"] not in seen_ids]
                for t in trades:
                    seen_ids.add(t["id"])
                # cap memory
                if len(seen_ids) > 5000:
                    seen_ids.clear()
                if fresh:
                    payload = _json.dumps({"trades": fresh, "ts": datetime.utcnow().isoformat()})
                    yield f"data: {payload}\n\n"
            except Exception as exc:
                yield f"data: {_json.dumps({'error': str(exc)})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/spreads")
async def get_spreads(limit: int = 100, min_spread_pct: float = 0.0) -> Dict[str, Any]:
    """
    Compute current spreads between Polymarket and Kalshi.

    Returns a list of spread rows containing the latest price seen
    on each exchange (if available) and the spread percentage.
    """
    try:
        rows: list = []
        if USE_REAL_API:
            # Fetch recent trades from both platforms and aggregate by normalized market key
            recent = await data_fetcher.fetch_recent_trades(limit=2000)

            by_key: Dict[str, Dict[str, Any]] = {}
            for t in recent:
                # Try to extract market title and price from trade payloads
                market_text = t.get("market") or t.get("question") or t.get("title") or ""
                key = _normalize_question(market_text)
                if not key:
                    key = t.get("market_id") or t.get("id") or str(id(t))

                entry = by_key.setdefault(key, {
                    "question": market_text,
                    "polymarket_price": None,
                    "kalshi_price": None,
                    "last_ts": None,
                    "pm_trades": 0,
                    "kx_trades": 0,
                })

                price = t.get("price")
                # Price may come as 0-1 float or cents-scaled int; normalize to cents
                if isinstance(price, float) and price <= 1.0:
                    price_cents = round(price * 100, 4)
                else:
                    try:
                        price_cents = float(price)
                    except Exception:
                        price_cents = None

                src = (t.get("exchange") or t.get("source") or "").lower()
                if "kalshi" in src or (t.get("id") or "").startswith("KX"):
                    if price_cents is not None:
                        entry["kalshi_price"] = price_cents
                    entry["kx_trades"] += 1
                else:
                    # assume polymarket
                    if price_cents is not None:
                        entry["polymarket_price"] = price_cents
                    entry["pm_trades"] += 1

                ts = t.get("ts") or t.get("timestamp") or t.get("created_at")
                if ts:
                    entry["last_ts"] = ts

            for k, e in by_key.items():
                pm = e.get("polymarket_price")
                kx = e.get("kalshi_price")
                if pm is None or kx is None:
                    continue
                spread_pct = abs(pm - kx) / 100.0
                if spread_pct < min_spread_pct:
                    continue
                rows.append({
                    "key": k,
                    "question": e.get("question"),
                    "polymarket_price": pm,
                    "kalshi_price": kx,
                    "spread_pct": round(spread_pct, 4),
                    "pm_trades": e.get("pm_trades"),
                    "kx_trades": e.get("kx_trades"),
                    "last_ts": e.get("last_ts"),
                })

        else:
            # Use mock generator to produce spreads
            mock = generate_mock_markets()
            for m in mock:
                pm = m.get("polymarket_price")
                kx = m.get("kalshi_price")
                if pm is None or kx is None:
                    continue
                spread_pct = abs(pm - kx) / 100.0
                if spread_pct < min_spread_pct:
                    continue
                rows.append({
                    "key": m.get("id"),
                    "question": m.get("question"),
                    "polymarket_price": pm,
                    "kalshi_price": kx,
                    "spread_pct": round(spread_pct, 4),
                    "pm_trades": 0,
                    "kx_trades": 0,
                    "last_ts": m.get("last_updated"),
                })

        # Sort by spread desc
        rows.sort(key=lambda r: r.get("spread_pct", 0), reverse=True)
        # Persist top rows (best-effort)
        for r in rows[:min(len(rows), 100)]:
            try:
                _persist_spread(r)
            except Exception:
                pass

        return {"success": True, "count": len(rows[:limit]), "spreads": rows[:limit], "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        return {"success": False, "error": str(e), "spreads": [], "count": 0, "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/spreads/stream")
async def stream_spreads(min_spread_pct: float = 0.0):
    """SSE stream that periodically emits the latest spreads."""
    import json as _json
    from starlette.responses import StreamingResponse

    async def gen():
        while True:
            try:
                res = await get_spreads(limit=200, min_spread_pct=min_spread_pct)
                yield f"data: {_json.dumps(res)}\n\n"
            except Exception as exc:
                yield f"data: {_json.dumps({'error': str(exc)})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(gen(), media_type="text/event-stream")


# --- Trade preview & execute endpoints (safe defaults: simulate) ---
@app.post("/api/trade/preview")
async def preview_trade(spread_key: str, side: str = "buy", size_usd: float = None) -> Dict[str, Any]:
    """Return a preview for a trade (price suggestion and max size)."""
    try:
        # Default risk cap (env or conservative)
        max_order_usd = float(os.getenv("MAX_ORDER_USD", "100"))
        # Fetch spreads to find the matching key
        spreads_res = await get_spreads(limit=500)
        found = None
        for s in spreads_res.get("spreads", []):
            if s.get("key") == spread_key:
                found = s
                break
        if not found:
            return {"success": False, "error": "Spread not found"}

        # Price suggestion: midpoint
        price = (found.get("polymarket_price") + found.get("kalshi_price")) / 2.0
        suggested_size = min(max_order_usd, size_usd or max_order_usd)

        return {"success": True, "preview": {"price": price, "size_usd": suggested_size, "question": found.get("question")}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/trade/execute")
async def execute_trade(spread_key: str, side: str = "buy", size_usd: float = 10.0, price: float = None, simulate: bool = True) -> Dict[str, Any]:
    """Execute or simulate an order. Live execution only if `LIVE_TRADING=true`.

    NOTE: Real exchange calls are not implemented here; this endpoint simulates fills
    and persists an order record. If you want true live execution, extend this
    function to call Polymarket/Kalshi SDKs and replace the simulated response.
    """
    try:
        # Safety guard: check runtime toggle
        global ALLOW_LIVE
        live_flag = ALLOW_LIVE
        if not simulate and not live_flag:
            return {"success": False, "error": "Live trading disabled (enable via ADMIN endpoint or set LIVE_TRADING=true)"}

        # Get spread info
        spreads_res = await get_spreads(limit=500)
        found = None
        for s in spreads_res.get("spreads", []):
            if s.get("key") == spread_key:
                found = s
                break
        if not found:
            return {"success": False, "error": "Spread not found"}

        # If price not provided, use midpoint
        exec_price = price if price is not None else (found.get("polymarket_price") + found.get("kalshi_price")) / 2.0

        # Build an execution plan: split into child orders to respect max child order size and rate limits
        def _plan_execution(total_usd: float):
            max_child = float(os.getenv('MAX_CHILD_ORDER_USD', '50'))
            rate_ms = int(os.getenv('ORDER_RATE_MS', '250'))
            parts = []
            remaining = float(total_usd)
            while remaining > 0:
                take = min(remaining, max_child)
                parts.append({'size_usd': round(take, 2), 'delay_ms': rate_ms})
                remaining -= take
            return parts

        plan = _plan_execution(size_usd)

        # Create master order record (persisted)
        order_id = str(uuid.uuid4())
        master = {
            "id": order_id,
            "spread_key": spread_key,
            "question": found.get("question"),
            "side": side,
            "size_usd": size_usd,
            "price": exec_price,
            "status": "planned" if not (simulate or not live_flag) else "simulated",
            "simulate": simulate or not live_flag,
            "details": {"plan": plan},
        }

        try:
            _persist_order(master)
        except Exception:
            pass

        # If only preview/simulate, return plan
        if simulate or not live_flag:
            return {"success": True, "order": master, "plan": plan}

        # Live execution (NOTE: replace placeholder with real SDK calls)
        results = []
        # Determine which exchange is cheaper to buy and which to sell
        pm_price = found.get('polymarket_price')
        kx_price = found.get('kalshi_price')
        buy_exchange = 'polymarket' if pm_price <= kx_price else 'kalshi'
        sell_exchange = 'kalshi' if buy_exchange == 'polymarket' else 'polymarket'

        for idx, leg in enumerate(plan):
            leg_id = f"{order_id}:{idx}"
            size = leg['size_usd']
            # Attempt buy then sell for spread capture
            # publish pre-execution event
            pre_ev = {
                'type': 'execution_pre',
                'order_id': order_id,
                'leg_id': leg_id,
                'buy_exchange': buy_exchange,
                'sell_exchange': sell_exchange,
                'size_usd': size,
                'price': exec_price,
                'side': side,
                'ts': datetime.utcnow().isoformat(),
            }
            try:
                _publish_execution_event(pre_ev)
            except Exception:
                pass

            buy_resp = await ea_place_order(data_fetcher if 'data_fetcher' in globals() else None, buy_exchange, found.get('question') or spread_key, side, size, exec_price, simulate=False)
            sell_resp = await ea_place_order(data_fetcher if 'data_fetcher' in globals() else None, sell_exchange, found.get('question') or spread_key, 'sell' if side == 'buy' else 'buy', size, exec_price, simulate=False)

            post_ev = {
                'type': 'execution_post',
                'order_id': order_id,
                'leg_id': leg_id,
                'buy': buy_resp,
                'sell': sell_resp,
                'size_usd': size,
                'price': exec_price,
                'side': side,
                'ts': datetime.utcnow().isoformat(),
            }
            try:
                _publish_execution_event(post_ev)
            except Exception:
                pass

            leg_rec = {
                "id": leg_id,
                "parent_id": order_id,
                "size_usd": size,
                "price": exec_price,
                "side": side,
                "buy": buy_resp,
                "sell": sell_resp,
            }

            try:
                _persist_order({
                    "id": leg_rec['id'],
                    "spread_key": spread_key,
                    "question": found.get("question"),
                    "side": side,
                    "size_usd": leg_rec['size_usd'],
                    "price": leg_rec['price'],
                    "status": "submitted",
                    "simulate": False,
                    "created_at": datetime.utcnow().isoformat(),
                    "details": str({"buy": buy_resp, "sell": sell_resp}),
                })
            except Exception:
                pass

            results.append(leg_rec)
            await asyncio.sleep(leg['delay_ms'] / 1000.0)

        # mark master as submitted
        try:
            conn = DB_CONN
            if conn:
                cur = conn.cursor()
                cur.execute("UPDATE orders SET status = ? WHERE id = ?", ("submitted", order_id))
                conn.commit()
        except Exception:
            pass

        return {"success": True, "order": master, "legs": results}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/order-history")
async def order_history(limit: int = 200):
    try:
        conn = DB_CONN
        if conn is None:
            return {"success": False, "error": "DB not available", "orders": []}
        cur = conn.cursor()
        cur.execute("SELECT id, spread_key, question, side, size_usd, price, status, simulate, created_at FROM orders ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cur.fetchall()
        orders = []
        for r in rows:
            orders.append({
                "id": r[0],
                "spread_key": r[1],
                "question": r[2],
                "side": r[3],
                "size_usd": r[4],
                "price": r[5],
                "status": r[6],
                "simulate": bool(r[7]),
                "created_at": r[8],
            })
        return {"success": True, "orders": orders}
    except Exception as e:
        return {"success": False, "error": str(e), "orders": []}


@app.get("/api/spread-history")
async def spread_history(spread_key: str = None, limit: int = 200):
    try:
        conn = DB_CONN
        if conn is None:
            return {"success": False, "error": "DB not available", "history": []}
        cur = conn.cursor()
        if spread_key:
            cur.execute("SELECT spread_key, question, polymarket_price, kalshi_price, spread_pct, recorded_at FROM spreads WHERE spread_key = ? ORDER BY recorded_at DESC LIMIT ?", (spread_key, limit))
        else:
            cur.execute("SELECT spread_key, question, polymarket_price, kalshi_price, spread_pct, recorded_at FROM spreads ORDER BY recorded_at DESC LIMIT ?", (limit,))
        rows = cur.fetchall()
        history = []
        for r in rows:
            history.append({
                "spread_key": r[0],
                "question": r[1],
                "polymarket_price": r[2],
                "kalshi_price": r[3],
                "spread_pct": r[4],
                "recorded_at": r[5],
            })
        return {"success": True, "history": history}
    except Exception as e:
        return {"success": False, "error": str(e), "history": []}


@app.get("/api/execution/stream")
async def execution_stream():
    """SSE endpoint streaming execution events (pre/post leg events).

    Connect and keep the HTTP connection open to receive JSON events as they occur.
    """
    from starlette.responses import StreamingResponse

    async def gen_events():
        q: "asyncio.Queue" = asyncio.Queue()
        EXECUTION_SUBSCRIBERS.append(q)
        try:
            # Send a welcome message
            await q.put({"type": "welcome", "ts": datetime.utcnow().isoformat()})
            while True:
                try:
                    ev = await q.get()
                    payload = _json.dumps(ev)
                    yield f"data: {payload}\n\n"
                except asyncio.CancelledError:
                    break
                except Exception:
                    # keep running on per-event errors
                    continue
        finally:
            try:
                EXECUTION_SUBSCRIBERS.remove(q)
            except Exception:
                pass

    return StreamingResponse(gen_events(), media_type="text/event-stream")


@app.post("/api/backtest")
async def backtest(spread_key: str = None, min_spread_pct: float = 0.05, size_usd: float = 10.0, limit: int = 1000):
    """Simple backtester that scans persisted spread events and simulates taking a fixed-size position on each opportunity.

    This is a lightweight simulator intended for quick signal evaluation, not a full market simulator.
    Profit model: profit = spread_pct * size_usd where `spread_pct` is the stored decimal (e.g., 0.05 = 5%).
    """
    try:
        conn = DB_CONN
        if conn is None:
            return {"success": False, "error": "DB not available", "results": {}}

        cur = conn.cursor()
        if spread_key:
            cur.execute("SELECT spread_key, question, polymarket_price, kalshi_price, spread_pct, recorded_at FROM spreads WHERE spread_key = ? AND spread_pct >= ? ORDER BY recorded_at ASC LIMIT ?", (spread_key, min_spread_pct, limit))
        else:
            cur.execute("SELECT spread_key, question, polymarket_price, kalshi_price, spread_pct, recorded_at FROM spreads WHERE spread_pct >= ? ORDER BY recorded_at ASC LIMIT ?", (min_spread_pct, limit))
        rows = cur.fetchall()

        total_profit = 0.0
        opportunities = []
        for r in rows:
            sp = float(r[4] or 0.0)
            profit = sp * float(size_usd)
            total_profit += profit
            opportunities.append({
                "spread_key": r[0],
                "question": r[1],
                "polymarket_price": r[2],
                "kalshi_price": r[3],
                "spread_pct": sp,
                "recorded_at": r[5],
                "sim_profit": round(profit, 4),
            })

        return {"success": True, "count": len(opportunities), "total_profit": round(total_profit, 4), "opportunities": opportunities}
    except Exception as e:
        return {"success": False, "error": str(e), "results": {}}


@app.post("/api/spread-ingest")
async def spread_ingest(trade: Dict[str, Any], x_spread_secret: str = None):
    """Accept normalized trades from ingestion services (node ws). Requires `X-SPREAD-SECRET` header if configured.

    The trade payload must match the normalized schema described in the repo documentation.
    """
    try:
        # Auth: header should match SPREAD_INGEST_SECRET if set
        header = x_spread_secret or ''
        if SPREAD_INGEST_SECRET and header != SPREAD_INGEST_SECRET:
            return {"success": False, "error": "invalid ingest secret"}

        # Validate minimal fields
        src = trade.get('source')
        market_id = trade.get('market_id') or ''
        unique_id = trade.get('unique_id') or ''
        price = trade.get('price')
        outcome = trade.get('outcome')

        if not src or not market_id or not unique_id or price is None:
            return {"success": False, "error": "missing fields"}

        # Persist trade (best-effort)
        try:
            _persist_trade(trade)
        except Exception:
            pass

        # Update in-memory best prices
        key = _normalize_question(market_id)
        if not key:
            key = market_id

        bucket = BEST_PRICES.setdefault(key, {})
        # Use source to set bucket
        bucket_src = 'kalshi' if 'kalshi' in src.lower() else 'polymarket' if 'polymarket' in src.lower() or 'poly' in src.lower() else src.lower()

        # keep the latest price per source/outcome
        bucket[bucket_src] = {
            'price': float(price),
            'ts': int(trade.get('timestamp') or 0),
            'outcome': outcome,
        }

        # If we have both sides, compute spread
        if 'polymarket' in bucket and 'kalshi' in bucket:
            pm = bucket['polymarket'].get('price')
            kx = bucket['kalshi'].get('price')
            if pm is not None and kx is not None:
                spread_pct = abs(pm - kx) / 100.0
                # Threshold
                thresh = float(os.getenv('SPREAD_ALERT_PCT', '0.05'))
                if spread_pct >= thresh:
                    # create a candidate and optionally execute
                    candidate = {
                        'key': key,
                        'question': market_id,
                        'polymarket_price': pm,
                        'kalshi_price': kx,
                        'spread_pct': round(spread_pct, 6),
                    }
                    # persist candidate as a spread row
                    try:
                        _persist_spread(candidate)
                    except Exception:
                        pass

                    # Send alert webhook if configured (fire-and-forget)
                    alert_url = os.getenv('SPREAD_ALERT_WEBHOOK', '')
                    if alert_url:
                        try:
                            import httpx
                            async def _send_alert(u, payload):
                                try:
                                    async with httpx.AsyncClient(timeout=5.0) as client:
                                        await client.post(u, json=payload)
                                except Exception:
                                    pass
                            asyncio.create_task(_send_alert(alert_url, candidate))
                        except Exception:
                            pass

                    # If live trading enabled and configured, call execute endpoint
                    live_flag = os.getenv('LIVE_TRADING', 'false').lower() == 'true'
                    # Execute only if live flag true (and we prefer the execute_trade API to handle safety)
                    if live_flag:
                        try:
                            # Call internal execute_trade function (simulate=False)
                            await execute_trade(spread_key=key, side='buy', size_usd=float(os.getenv('DEFAULT_ORDER_USD', '50')), price=None, simulate=False)
                        except Exception as e:
                            # log and continue
                            print('execute_trade error', e)

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


SECTOR_DEFINITIONS = {
    "trending": {
        "name": "Trending",
        "emoji": "🔥",
        "description": "Most popular markets right now",
        "color": "#ef4444",
        "cover_image": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=250&fit=crop&q=80",
        "keywords": [],
    },
    "politics": {
        "name": "Politics",
        "emoji": "🗳️",
        "description": "Elections, legislation & government",
        "color": "#3b82f6",
        "cover_image": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=400&h=250&fit=crop&q=80",
        "keywords": ["election", "president", "democrat", "republican", "congress", "senate", "governor", "vote", "party", "nominee", "political", "trump", "biden", "house", "legislation", "bill"],
    },
    "sports": {
        "name": "Sports",
        "emoji": "🏈",
        "description": "NFL, NBA, MLB, soccer & more",
        "color": "#10b981",
        "cover_image": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=250&fit=crop&q=80",
        "keywords": [
            # Leagues & competitions
            "nfl", "nba", "mlb", "nhl", "mls", "pga", "ufc", "wta", "atp",
            "premier league", "la liga", "bundesliga", "serie a", "ligue 1",
            "champions league", "ucl", "europa league", "copa america",
            "world cup", "super bowl", "march madness", "world series",
            "ncaa", "college football", "college basketball",
            # Sports names
            "soccer", "football", "basketball", "baseball", "hockey",
            "tennis", "golf", "boxing", "mma", "cricket", "rugby",
            "esports", "counter-strike", "formula 1", "f1", "nascar",
            # Sports terms (specific enough)
            "mvp", "championship", "playoff", "playoffs", "halftime",
            "touchdown", "quarterback", "goalkeeper", "striker",
            "home run", "grand slam", "hole in one",
            # Teams – NFL
            "patriots", "chiefs", "eagles", "cowboys", "49ers", "bills",
            "ravens", "dolphins", "jets", "packers", "bears", "lions",
            "seahawks", "rams", "steelers", "bengals", "chargers",
            "broncos", "raiders", "texans", "colts", "titans", "jaguars",
            "commanders", "giants", "saints", "falcons", "buccaneers",
            "panthers", "cardinals", "vikings", "browns",
            # Teams – NBA
            "celtics", "lakers", "knicks", "warriors", "nets", "76ers",
            "bucks", "nuggets", "heat", "suns", "cavaliers", "mavericks",
            "grizzlies", "thunder", "timberwolves", "clippers", "rockets",
            "spurs", "blazers", "trail blazers", "wizards", "raptors",
            "pelicans", "pacers", "hornets", "pistons", "hawks", "magic",
            # Teams – Soccer
            "bayern", "real madrid", "barcelona", "liverpool", "arsenal",
            "manchester city", "manchester united", "chelsea fc", "tottenham",
            "psg", "juventus", "inter milan", "borussia dortmund", "atletico",
        ],
    },
    "crypto": {
        "name": "Crypto",
        "emoji": "₿",
        "description": "Bitcoin, Ethereum & digital assets",
        "color": "#f59e0b",
        "cover_image": "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=250&fit=crop&q=80",
        "keywords": ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "token", "defi", "solana", "sol", "altcoin", "stablecoin", "nft"],
    },
    "economics": {
        "name": "Economics",
        "emoji": "📊",
        "description": "Fed, interest rates & macro indicators",
        "color": "#8b5cf6",
        "cover_image": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=250&fit=crop&q=80",
        "keywords": ["fed", "interest rate", "inflation", "gdp", "unemployment", "recession", "tariff", "trade war", "jobs", "cpi", "fomc", "rate cut", "rate hike", "economic", "economy", "federal reserve", "treasury"],
    },
    "culture": {
        "name": "Culture",
        "emoji": "🎬",
        "description": "Entertainment, media & pop culture",
        "color": "#ec4899",
        "cover_image": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=250&fit=crop&q=80",
        "keywords": ["movie", "film", "oscar", "grammy", "music", "celebrity", "tiktok", "youtube", "mrbeast", "streaming", "netflix", "disney", "entertainment", "tv", "show", "viral", "album", "award"],
    },
    "world": {
        "name": "World",
        "emoji": "🌍",
        "description": "Geopolitics, conflicts & global affairs",
        "color": "#06b6d4",
        "cover_image": "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=400&h=250&fit=crop&q=80",
        "keywords": ["war", "peace", "ceasefire", "russia", "ukraine", "china", "iran", "strike", "nato", "military", "invasion", "territory", "greenland", "venezuela", "europe", "asia", "middle east", "conflict", "sanctions"],
    },
    "climate": {
        "name": "Climate",
        "emoji": "🌡️",
        "description": "Weather, temperatures & environment",
        "color": "#22c55e",
        "cover_image": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=250&fit=crop&q=80",
        "keywords": ["climate", "temperature", "weather", "hurricane", "wildfire", "earthquake", "flood", "carbon", "emissions", "renewable", "energy", "hottest", "record"],
    },
    "companies": {
        "name": "Companies",
        "emoji": "🏢",
        "description": "Big Tech, IPOs & corporate moves",
        "color": "#6366f1",
        "cover_image": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=250&fit=crop&q=80",
        "keywords": ["apple", "google", "meta", "microsoft", "amazon", "tesla", "nvidia", "stock", "ipo", "merger", "acquisition", "ceo", "earnings", "revenue", "valuation", "company", "startup"],
    },
    "science": {
        "name": "Tech & Science",
        "emoji": "🔬",
        "description": "AI, space, breakthroughs & innovation",
        "color": "#14b8a6",
        "cover_image": "https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=400&h=250&fit=crop&q=80",
        "keywords": ["ai", "artificial intelligence", "gpt", "openai", "spacex", "nasa", "mars", "launch", "robot", "quantum", "scientist", "research", "discovery", "technology", "innovation"],
    },
    "financials": {
        "name": "Financials",
        "emoji": "💰",
        "description": "Markets, S&P 500 & banking",
        "color": "#eab308",
        "cover_image": "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&h=250&fit=crop&q=80",
        "keywords": ["s&p", "dow", "nasdaq", "stock market", "bond", "yield", "bank", "wall street", "bull", "bear", "index", "market cap", "rally", "crash"],
    },
}


import re as _classify_re

# Pre-compile a regex for each sector's keywords (word-boundary matching)
_SECTOR_PATTERNS: Dict[str, "_classify_re.Pattern"] = {}

def _build_sector_patterns():
    for slug, defn in SECTOR_DEFINITIONS.items():
        if slug == "trending" or not defn["keywords"]:
            continue
        # Sort longest-first so multi-word keywords match before single words
        kws = sorted(defn["keywords"], key=len, reverse=True)
        escaped = [_classify_re.escape(k) for k in kws]
        pattern = r'\b(?:' + '|'.join(escaped) + r')\b'
        _SECTOR_PATTERNS[slug] = _classify_re.compile(pattern, _classify_re.IGNORECASE)

_build_sector_patterns()


def _classify_market(question: str, category: str, tags: list) -> List[str]:
    """Return all matching sector slugs for a market."""
    text = f"{question} {category} {' '.join(tags)}"
    sectors = []
    for slug, pat in _SECTOR_PATTERNS.items():
        if pat.search(text):
            sectors.append(slug)
    return sectors if sectors else ["trending"]


import re as _re
from difflib import SequenceMatcher as _SM

# Common stop-words to strip for matching
_STOP = frozenset(
    "a an the is are was were will be do does did have has had of in on at to for "
    "by with from and or but not no if then so how what who which when where why "
    "before after above below between next new".split()
)


def _normalize_question(q: str) -> str:
    """Normalize a market question for cross-exchange matching.

    Polymarket format:  "Parent Title - Specific Outcome"
    Kalshi format:      "Parent Title?"

    We take the parent title (before the first ' - ') if present,
    lowercase it, strip punctuation, and remove stop-words so the
    remaining key tokens can be compared.
    """
    q = q.strip()
    # Take parent part before the first dash separator
    parts = q.split(' - ')
    base = parts[0].strip() if parts else q
    # Remove trailing '?' and lowercase
    base = _re.sub(r'[^a-z0-9 ]', '', base.lower())
    base = _re.sub(r'\s+', ' ', base).strip()
    # Remove stop-words (keep content words only)
    tokens = [t for t in base.split() if t not in _STOP]
    return ' '.join(tokens)


def _token_overlap(a: str, b: str) -> float:
    """Jaccard similarity on token sets."""
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _merge_cross_exchange(markets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge markets that exist on both exchanges into a single row with
    sources=["Polymarket", "Kalshi"], combined volume, and best image.

    Uses a two-pass approach:
      1. Exact normalized-key match (fast & precise)
      2. Fuzzy token-overlap match for remaining unmatched markets (catches
         slightly different phrasings across exchanges)
    """
    groups: Dict[str, Dict[str, Any]] = {}
    order: List[str] = []

    def _add_to_group(key: str, m: Dict[str, Any]):
        if key in groups:
            existing = groups[key]
            src = m.get('source', '')
            if src and src not in existing['sources']:
                existing['sources'].append(src)
            existing['volume'] = (existing.get('volume') or 0) + (m.get('volume') or 0)
            existing['open_interest'] = (existing.get('open_interest') or 0) + (m.get('open_interest') or 0)
            if not existing.get('image_url') and m.get('image_url'):
                existing['image_url'] = m['image_url']
            if not existing.get('description') and m.get('description'):
                existing['description'] = m['description']
            if m.get('outcomes') and not existing.get('outcomes'):
                existing['outcomes'] = m['outcomes']
            elif m.get('outcomes') and existing.get('outcomes'):
                if any(o.get('price') is not None for o in m['outcomes']):
                    existing['outcomes'] = m['outcomes']
            if m.get('price') is not None and existing.get('price') is None:
                existing['price'] = m['price']
        else:
            merged = dict(m)
            merged['sources'] = [m.get('source', '')] if m.get('source') else []
            groups[key] = merged
            order.append(key)

    # --- Pass 1: exact normalized key match ---
    unmatched: List[Dict[str, Any]] = []
    for m in markets:
        key = _normalize_question(m.get('question', ''))
        if not key:
            key = m.get('id', str(id(m)))
        if key in groups:
            _add_to_group(key, m)
        else:
            # Try existing keys for high token overlap (> 0.65)
            best_key, best_score = None, 0.0
            for existing_key in groups:
                score = _token_overlap(key, existing_key)
                if score > best_score:
                    best_score = score
                    best_key = existing_key
            if best_score >= 0.50 and best_key:
                _add_to_group(best_key, m)
            else:
                _add_to_group(key, m)

    return [groups[k] for k in order]


@app.get("/api/sectors")
async def get_sectors() -> Dict[str, Any]:
    """Return the list of available sectors with metadata, including a
    preview image from the top market in each sector."""

    # Best-effort: grab cached markets to pick a preview image per sector.
    all_markets: List[Dict[str, Any]] = []
    try:
        if USE_REAL_API:
            all_markets = await data_fetcher.fetch_all_markets(source="all", limit=1500)
    except Exception:
        pass

    # Pre-sort once by volume descending
    all_markets.sort(key=lambda m: m.get("volume", 0) or 0, reverse=True)

    sectors = []
    for slug, defn in SECTOR_DEFINITIONS.items():
        # Find the first market with an image that matches this sector
        preview_image = ""
        if slug == "trending":
            for m in all_markets:
                if m.get("image_url"):
                    preview_image = m["image_url"]
                    break
        else:
            for m in all_markets:
                if m.get("image_url") and slug in _classify_market(
                    m.get("question", ""), m.get("category", ""), m.get("tags", [])
                ):
                    preview_image = m["image_url"]
                    break

        sectors.append({
            "slug": slug,
            "name": defn["name"],
            "emoji": defn["emoji"],
            "description": defn["description"],
            "color": defn["color"],
            "preview_image": preview_image,
            "cover_image": defn.get("cover_image", ""),
        })
    return {"success": True, "sectors": sectors, "timestamp": datetime.utcnow().isoformat()}


def _persist_spread(row: Dict[str, Any]):
    """Persist a spread row into the SQLite DB (best-effort)."""
    try:
        conn = DB_CONN
        if conn is None:
            return
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO spreads (id, spread_key, question, polymarket_price, kalshi_price, spread_pct, pm_trades, kx_trades, last_ts, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                row.get("key"),
                row.get("question"),
                row.get("polymarket_price"),
                row.get("kalshi_price"),
                row.get("spread_pct"),
                row.get("pm_trades") or 0,
                row.get("kx_trades") or 0,
                row.get("last_ts"),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
    except Exception:
        pass


def _persist_order(order: Dict[str, Any]):
    try:
        conn = DB_CONN
        if conn is None:
            return
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO orders (id, spread_key, question, side, size_usd, price, status, simulate, created_at, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                order.get("id") or str(uuid.uuid4()),
                order.get("spread_key"),
                order.get("question"),
                order.get("side"),
                order.get("size_usd"),
                order.get("price"),
                order.get("status"),
                1 if order.get("simulate") else 0,
                datetime.utcnow().isoformat(),
                str(order.get("details") or ""),
            ),
        )
        conn.commit()
    except Exception:
        pass


def _persist_trade(trade: Dict[str, Any]):
    """Persist a normalized trade into the backend SQLite DB."""
    try:
        conn = DB_CONN
        if conn is None:
            return
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO trades (id, source, market_id, outcome, price, size, side, timestamp, unique_id, raw_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                trade.get("source"),
                trade.get("market_id"),
                trade.get("outcome"),
                trade.get("price"),
                trade.get("size"),
                trade.get("side"),
                int(trade.get("timestamp") or 0),
                trade.get("unique_id"),
                str(trade.get("raw") or ""),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
    except Exception:
        pass




@app.get("/api/sectors/{sector_slug}")
async def get_sector_markets(sector_slug: str, limit: int = 30) -> Dict[str, Any]:
    """Return top markets + recent trades for a specific sector."""
    if sector_slug not in SECTOR_DEFINITIONS:
        return {"success": False, "error": f"Unknown sector: {sector_slug}", "markets": [], "trades": []}

    defn = SECTOR_DEFINITIONS[sector_slug]

    try:
        # Fetch markets (cached after first load)
        if USE_REAL_API:
            all_markets = await data_fetcher.fetch_all_markets(source="all", limit=1500)
        else:
            all_markets = generate_mock_markets() if not USE_REAL_API else []

        # Classify and filter
        if sector_slug == "trending":
            filtered = sorted(all_markets, key=lambda m: m.get("volume", 0) or 0, reverse=True)
        else:
            filtered = []
            for m in all_markets:
                sectors = _classify_market(
                    m.get("question", ""),
                    m.get("category", ""),
                    m.get("tags", []),
                )
                if sector_slug in sectors:
                    filtered.append(m)
            filtered.sort(key=lambda m: m.get("volume", 0) or 0, reverse=True)

        # Merge cross-exchange duplicates so both badges show
        merged = _merge_cross_exchange(filtered)
        merged.sort(key=lambda m: m.get("volume", 0) or 0, reverse=True)
        matched = merged[:limit]

        # Fetch recent trades with a short timeout to avoid blocking
        trades: list = []
        if USE_REAL_API:
            try:
                all_trades_raw = await asyncio.wait_for(
                    data_fetcher.fetch_recent_trades(limit=100),
                    timeout=5.0,
                )
                for t in all_trades_raw:
                    t_sectors = _classify_market(t.get("market", ""), "", [])
                    if sector_slug == "trending" or sector_slug in t_sectors:
                        trades.append(t)
                        if len(trades) >= 20:
                            break
            except asyncio.TimeoutError:
                pass  # Return markets without trades rather than blocking

        return {
            "success": True,
            "sector": {
                "slug": sector_slug,
                "name": defn["name"],
                "emoji": defn["emoji"],
                "description": defn["description"],
                "color": defn["color"],
            },
            "count": len(matched),
            "markets": matched,
            "trades": trades,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "sector": {"slug": sector_slug, "name": defn["name"]},
            "markets": [],
            "trades": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat(),
        }


@app.get("/api/insiders")
async def get_insiders(max_days_ago: int = 7, include_bots: bool = False, limit: int = 50) -> Dict[str, Any]:
    """
    Detect potential insider traders on Polymarket.
    
    Highlights traders whose activity appears unusual:
    - Enter at low prices on markets that later move significantly
    - Make very large trades relative to the market average (high Z-Score)
    - Have little account history and rarely trade other markets
    
    Args:
        max_days_ago: Filter by maximum wallet age (default: no limit)
        include_bots: Whether to include bot-flagged accounts
        limit: Max results (default 50)
    """
    try:
        if USE_REAL_API:
            insiders = await data_fetcher.fetch_potential_insiders(
                max_days_ago=max_days_ago,
                include_bots=include_bots,
                limit=limit
            )
        else:
            insiders = []
        
        return {
            "success": True,
            "count": len(insiders),
            "insiders": insiders,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "insiders": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat()
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
