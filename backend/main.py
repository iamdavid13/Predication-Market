from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime

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
    data_fetcher = PMXTDataFetcher()


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
async def get_trades(market_id: str = None, limit: int = 50) -> Dict[str, Any]:
    """
    Fetch recent trades from both platforms.
    
    Args:
        market_id: Optional market ID to filter trades
        limit: Maximum number of trades to return (default 50)
    """
    try:
        if USE_REAL_API:
            trades = await data_fetcher.fetch_recent_trades(market_id, limit)
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


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
