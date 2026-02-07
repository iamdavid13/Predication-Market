"""
UnusualProbs - Prediction Market Aggregator
FastAPI backend that fetches and compares markets from Polymarket and Kalshi
"""
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from thefuzz import fuzz
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global storage for market data
market_data = {
    "markets": [],
    "last_update": None,
    "status": "initializing"
}

# Background task reference
background_task = None


async def fetch_polymarket_markets():
    """Fetch active markets from Polymarket using pmxt"""
    try:
        from pmxt import Polymarket
        
        polymarket = Polymarket()
        markets = polymarket.get_markets()
        
        # Process and normalize the data
        processed_markets = []
        if markets:
            for market in markets[:50]:  # Limit to first 50 markets
                try:
                    processed_markets.append({
                        "id": market.get("id", ""),
                        "title": market.get("question", market.get("title", "")),
                        "price": float(market.get("outcomePrices", [0.5])[0]) if market.get("outcomePrices") else 0.5,
                        "platform": "Polymarket"
                    })
                except Exception as e:
                    logger.error(f"Error processing Polymarket market: {e}")
                    continue
        
        logger.info(f"Fetched {len(processed_markets)} markets from Polymarket")
        return processed_markets
    except Exception as e:
        logger.error(f"Error fetching from Polymarket: {e}")
        logger.error(traceback.format_exc())
        return []


async def fetch_kalshi_markets():
    """Fetch active markets from Kalshi using pmxt"""
    try:
        from pmxt import Kalshi
        
        kalshi = Kalshi()
        markets = kalshi.get_markets()
        
        # Process and normalize the data
        processed_markets = []
        if markets:
            for market in markets[:50]:  # Limit to first 50 markets
                try:
                    processed_markets.append({
                        "id": market.get("ticker", market.get("id", "")),
                        "title": market.get("title", market.get("question", "")),
                        "price": float(market.get("yes_ask", market.get("price", 0.5))) / 100 if market.get("yes_ask") else 0.5,
                        "platform": "Kalshi"
                    })
                except Exception as e:
                    logger.error(f"Error processing Kalshi market: {e}")
                    continue
        
        logger.info(f"Fetched {len(processed_markets)} markets from Kalshi")
        return processed_markets
    except Exception as e:
        logger.error(f"Error fetching from Kalshi: {e}")
        logger.error(traceback.format_exc())
        return []


def calculate_similarity(title1: str, title2: str) -> int:
    """Calculate similarity between two market titles using fuzzy matching"""
    return fuzz.token_sort_ratio(title1.lower(), title2.lower())


def match_markets(polymarket_markets: List[Dict], kalshi_markets: List[Dict]) -> List[Dict]:
    """Match markets between platforms and calculate spreads"""
    matched_markets = []
    similarity_threshold = 70  # Minimum similarity score to consider a match
    
    for poly_market in polymarket_markets:
        best_match = None
        best_score = 0
        
        for kalshi_market in kalshi_markets:
            score = calculate_similarity(poly_market["title"], kalshi_market["title"])
            if score > best_score and score >= similarity_threshold:
                best_score = score
                best_match = kalshi_market
        
        if best_match:
            poly_price = poly_market["price"]
            kalshi_price = best_match["price"]
            spread = abs(poly_price - kalshi_price)
            spread_percentage = (spread * 100)
            
            matched_markets.append({
                "title": poly_market["title"],
                "polymarket_price": round(poly_price * 100, 2),  # Convert to percentage
                "kalshi_price": round(kalshi_price * 100, 2),    # Convert to percentage
                "spread": round(spread_percentage, 2),
                "similarity_score": best_score,
                "polymarket_id": poly_market["id"],
                "kalshi_id": best_match["id"]
            })
    
    # Sort by spread (descending)
    matched_markets.sort(key=lambda x: x["spread"], reverse=True)
    
    logger.info(f"Matched {len(matched_markets)} markets between platforms")
    return matched_markets


async def refresh_market_data():
    """Background task to refresh market data every 60 seconds"""
    while True:
        try:
            logger.info("Starting market data refresh...")
            market_data["status"] = "updating"
            
            # Fetch markets from both platforms
            polymarket_markets, kalshi_markets = await asyncio.gather(
                fetch_polymarket_markets(),
                fetch_kalshi_markets()
            )
            
            # Match markets and calculate spreads
            if polymarket_markets and kalshi_markets:
                matched = match_markets(polymarket_markets, kalshi_markets)
                market_data["markets"] = matched
                market_data["last_update"] = datetime.utcnow().isoformat()
                market_data["status"] = "success"
                logger.info(f"Market data updated successfully. Found {len(matched)} matched markets.")
            else:
                market_data["status"] = "error"
                logger.warning("No markets fetched from one or both platforms")
            
        except Exception as e:
            logger.error(f"Error in background task: {e}")
            logger.error(traceback.format_exc())
            market_data["status"] = "error"
        
        # Wait 60 seconds before next refresh
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    global background_task
    background_task = asyncio.create_task(refresh_market_data())
    logger.info("Background task started")
    yield
    # Shutdown
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            logger.info("Background task cancelled")


# Create FastAPI app
app = FastAPI(
    title="UnusualProbs API",
    description="Prediction Market Aggregator - Compare markets from Polymarket and Kalshi",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "UnusualProbs API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/markets")
async def get_markets():
    """Get all matched markets with spreads"""
    return {
        "markets": market_data["markets"],
        "last_update": market_data["last_update"],
        "status": market_data["status"],
        "count": len(market_data["markets"])
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": market_data["status"],
        "last_update": market_data["last_update"],
        "market_count": len(market_data["markets"])
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
