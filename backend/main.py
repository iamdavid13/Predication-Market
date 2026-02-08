import os
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime

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
