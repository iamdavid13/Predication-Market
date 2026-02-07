"""
UnusualProbs - Prediction Market Aggregator
FastAPI backend that fetches and compares markets from Polymarket and Kalshi
"""
import asyncio
from datetime import datetime, UTC
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
    """Fetch active markets from Polymarket API (or mock data in development)"""
    try:
        import httpx
        
        async with httpx.AsyncClient() as client:
            # Polymarket API endpoint for markets
            response = await client.get(
                "https://gamma-api.polymarket.com/markets",
                params={
                    "closed": "false",
                    "limit": 50
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                logger.error(f"Polymarket API returned status {response.status_code}")
                raise Exception("API error")
            
            markets_data = response.json()
            
            # Process and normalize the data
            processed_markets = []
            for market in markets_data:
                try:
                    # Get the "Yes" outcome price (typically the first outcome)
                    outcomes = market.get("outcomes", [])
                    price = 0.5  # Default
                    
                    if outcomes:
                        # Look for the Yes outcome or use the first one
                        for outcome in outcomes:
                            if outcome.get("outcome", "").lower() in ["yes", "true"]:
                                price = float(outcome.get("price", 0.5))
                                break
                        else:
                            # If no "Yes" found, use first outcome
                            price = float(outcomes[0].get("price", 0.5))
                    
                    processed_markets.append({
                        "id": market.get("id", ""),
                        "title": market.get("question", market.get("title", "")),
                        "price": price,
                        "platform": "Polymarket"
                    })
                except Exception as e:
                    logger.error(f"Error processing Polymarket market: {e}")
                    continue
            
            logger.info(f"Fetched {len(processed_markets)} markets from Polymarket")
            return processed_markets
            
    except Exception as e:
        logger.warning(f"Error fetching from Polymarket API, using mock data: {e}")
        # Return mock data for demonstration
        return [
            {"id": "pm1", "title": "Will Bitcoin reach $100k by March 2026?", "price": 0.65, "platform": "Polymarket"},
            {"id": "pm2", "title": "Will Trump win the 2024 election?", "price": 0.52, "platform": "Polymarket"},
            {"id": "pm3", "title": "Will Fed cut rates in Q1 2026?", "price": 0.78, "platform": "Polymarket"},
            {"id": "pm4", "title": "Will S&P 500 be above 6000 by year end?", "price": 0.71, "platform": "Polymarket"},
            {"id": "pm5", "title": "Will there be a recession in 2026?", "price": 0.35, "platform": "Polymarket"},
            {"id": "pm6", "title": "Will AI surpass human performance in coding by 2027?", "price": 0.58, "platform": "Polymarket"},
            {"id": "pm7", "title": "Will unemployment rate exceed 5% by mid-2026?", "price": 0.42, "platform": "Polymarket"},
            {"id": "pm8", "title": "Will Ethereum reach $5000 by June 2026?", "price": 0.48, "platform": "Polymarket"},
            {"id": "pm9", "title": "Will there be a government shutdown in 2026?", "price": 0.61, "platform": "Polymarket"},
            {"id": "pm10", "title": "Will inflation drop below 2% by end of 2026?", "price": 0.55, "platform": "Polymarket"},
        ]


async def fetch_kalshi_markets():
    """Fetch active markets from Kalshi API (or mock data in development)"""
    try:
        import httpx
        
        async with httpx.AsyncClient() as client:
            # Kalshi API endpoint for markets
            response = await client.get(
                "https://api.elections.kalshi.com/trade-api/v2/markets",
                params={
                    "limit": 50,
                    "status": "open"
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                logger.error(f"Kalshi API returned status {response.status_code}")
                raise Exception("API error")
            
            data = response.json()
            markets_data = data.get("markets", [])
            
            # Process and normalize the data
            processed_markets = []
            for market in markets_data:
                try:
                    # Kalshi prices are in cents (0-100)
                    yes_bid = market.get("yes_bid", 50)
                    yes_ask = market.get("yes_ask", 50)
                    # Use mid-price
                    price = (yes_bid + yes_ask) / 2 / 100  # Convert to 0-1 range
                    
                    processed_markets.append({
                        "id": market.get("ticker", market.get("id", "")),
                        "title": market.get("title", market.get("question", "")),
                        "price": price,
                        "platform": "Kalshi"
                    })
                except Exception as e:
                    logger.error(f"Error processing Kalshi market: {e}")
                    continue
            
            logger.info(f"Fetched {len(processed_markets)} markets from Kalshi")
            return processed_markets
            
    except Exception as e:
        logger.warning(f"Error fetching from Kalshi API, using mock data: {e}")
        # Return mock data for demonstration (with intentional price differences to show spreads)
        return [
            {"id": "k1", "title": "Bitcoin to hit $100k by March 2026?", "price": 0.68, "platform": "Kalshi"},  # 3% spread
            {"id": "k2", "title": "Trump wins 2024 Presidential election?", "price": 0.63, "platform": "Kalshi"},  # 11% spread (high divergence!)
            {"id": "k3", "title": "Federal Reserve rate cut in Q1 2026?", "price": 0.74, "platform": "Kalshi"},  # 4% spread
            {"id": "k4", "title": "S&P 500 above 6000 at year end?", "price": 0.73, "platform": "Kalshi"},  # 2% spread
            {"id": "k5", "title": "US recession occurs in 2026?", "price": 0.31, "platform": "Kalshi"},  # 4% spread
            {"id": "k6", "title": "AI beats humans at coding by 2027?", "price": 0.67, "platform": "Kalshi"},  # 9% spread (high divergence!)
            {"id": "k7", "title": "Unemployment above 5% by mid-2026?", "price": 0.39, "platform": "Kalshi"},  # 3% spread
            {"id": "k8", "title": "Ethereum reaches $5000 by June 2026?", "price": 0.51, "platform": "Kalshi"},  # 3% spread
            {"id": "k9", "title": "Government shutdown happens in 2026?", "price": 0.58, "platform": "Kalshi"},  # 3% spread
            {"id": "k10", "title": "Inflation below 2% by end of 2026?", "price": 0.52, "platform": "Kalshi"},  # 3% spread
        ]


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
                market_data["last_update"] = datetime.now(UTC).isoformat()
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
