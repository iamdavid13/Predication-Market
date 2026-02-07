from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from datetime import datetime

# Try to import pmxt, fall back to mock data if not available
try:
    from pmxt import PolymarketAPI, KalshiAPI, EventMatcher
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

# Initialize APIs if available
if USE_REAL_API:
    polymarket_api = PolymarketAPI()
    kalshi_api = KalshiAPI()
    matcher = EventMatcher()


def calculate_spread(polymarket_price: float, kalshi_price: float) -> float:
    """Calculate the spread between two prices as a percentage."""
    if polymarket_price is None or kalshi_price is None:
        return 0.0
    return abs(polymarket_price - kalshi_price) * 100


def format_market_data(matched_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Format matched events into the desired structure with spread calculation."""
    formatted_markets = []
    
    for event in matched_events:
        polymarket_data = event.get('polymarket', {})
        kalshi_data = event.get('kalshi', {})
        
        # Extract prices (assuming they're in probability format 0-1)
        polymarket_price = polymarket_data.get('price', 0.0) if polymarket_data else None
        kalshi_price = kalshi_data.get('price', 0.0) if kalshi_data else None
        
        if polymarket_price is None or kalshi_price is None:
            continue
        
        spread = calculate_spread(polymarket_price, kalshi_price)
        
        # Only include markets with spread > 5%
        if spread > 5.0:
            market = {
                'id': f"{polymarket_data.get('id', '')}_{kalshi_data.get('id', '')}",
                'question': event.get('question', 'Unknown Market'),
                'polymarket_price': round(polymarket_price * 100, 2),
                'kalshi_price': round(kalshi_price * 100, 2),
                'spread': round(spread, 2),
                'is_unusual': spread > 10.0,
                'polymarket_url': polymarket_data.get('url', ''),
                'kalshi_url': kalshi_data.get('url', ''),
                'last_updated': datetime.utcnow().isoformat()
            }
            formatted_markets.append(market)
    
    # Sort by spread descending
    formatted_markets.sort(key=lambda x: x['spread'], reverse=True)
    
    return formatted_markets


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
            # Fetch events from both platforms
            polymarket_events = await polymarket_api.get_events()
            kalshi_events = await kalshi_api.get_events()
            
            # Match events across platforms
            matched_events = matcher.match_events(polymarket_events, kalshi_events)
            
            # Format and filter markets
            markets = format_market_data(matched_events)
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
