"""
PMXT Integration Module
Handles fetching real market data from Polymarket and Kalshi using pmxt library.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
from pmxt import Polymarket, Kalshi


class PMXTDataFetcher:
    """Fetches and processes market data from Polymarket and Kalshi using pmxt."""
    
    def __init__(self):
        """Initialize pmxt clients without authentication (public data only)."""
        self.polymarket = Polymarket(private_key=None, auto_start_server=True)
        self.kalshi = Kalshi(api_key=None, private_key=None, auto_start_server=True)
    
    async def fetch_markets(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fetch active markets from both platforms and match them.
        
        Args:
            limit: Maximum number of markets to fetch from each platform
            
        Returns:
            List of matched markets with spread calculations
        """
        try:
            # Fetch markets from both platforms
            polymarket_markets = await self._fetch_polymarket_markets(limit)
            kalshi_markets = await self._fetch_kalshi_markets(limit)
            
            # Match markets across platforms
            matched_markets = self._match_markets(polymarket_markets, kalshi_markets)
            
            # Calculate spreads and filter
            processed_markets = self._process_matched_markets(matched_markets)
            
            return processed_markets
        except Exception as e:
            print(f"Error fetching markets: {e}")
            return []
    
    async def _fetch_polymarket_markets(self, limit: int) -> List[Dict[str, Any]]:
        """Fetch markets from Polymarket."""
        try:
            # Use pmxt to fetch markets - pass None for query to get all markets
            markets = await asyncio.to_thread(
                self.polymarket.fetch_markets,
                None  # No query filter, get all markets
            )
            # Convert UnifiedMarket objects to dicts
            if markets:
                return [self._unified_market_to_dict(m) for m in markets[:limit]]
            return []
        except Exception as e:
            print(f"Error fetching Polymarket markets: {e}")
            return []
    
    async def _fetch_kalshi_markets(self, limit: int) -> List[Dict[str, Any]]:
        """Fetch markets from Kalshi."""
        try:
            markets = await asyncio.to_thread(
                self.kalshi.fetch_markets,
                None  # No query filter, get all markets
            )
            # Convert UnifiedMarket objects to dicts
            if markets:
                return [self._unified_market_to_dict(m) for m in markets[:limit]]
            return []
        except Exception as e:
            print(f"Error fetching Kalshi markets: {e}")
            return []
    
    def _unified_market_to_dict(self, market) -> Dict[str, Any]:
        """Convert pmxt UnifiedMarket object to dictionary."""
        try:
            # UnifiedMarket has attributes like market_id, question, yes/no outcomes, url, etc.
            market_dict = {
                'id': str(getattr(market, 'market_id', '')),
                'symbol': getattr(market, 'symbol', ''),
                'question': getattr(market, 'question', getattr(market, 'title', '')),
                'url': getattr(market, 'url', ''),
            }
            
            # Extract price from yes outcome (probability of yes)
            yes_outcome = getattr(market, 'yes', None)
            if yes_outcome:
                market_dict['price'] = getattr(yes_outcome, 'price', None)
            else:
                # Fallback: try outcomes list
                outcomes = getattr(market, 'outcomes', [])
                if outcomes and len(outcomes) > 0:
                    market_dict['price'] = getattr(outcomes[0], 'price', None)
                else:
                    market_dict['price'] = None
            
            return market_dict
        except Exception as e:
            print(f"Error converting market to dict: {e}")
            return {}
    
    def _match_markets(
        self,
        polymarket_markets: List[Dict[str, Any]],
        kalshi_markets: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Match markets across platforms based on question similarity.
        
        Simple matching strategy: look for common keywords in questions.
        """
        matched = []
        
        for poly_market in polymarket_markets:
            poly_question = poly_market.get('question', '').lower()
            
            for kalshi_market in kalshi_markets:
                kalshi_question = kalshi_market.get('question', '').lower()
                
                # Simple keyword matching
                if self._questions_match(poly_question, kalshi_question):
                    matched.append({
                        'polymarket': poly_market,
                        'kalshi': kalshi_market,
                        'question': poly_market.get('question', kalshi_question)
                    })
                    break
        
        return matched
    
    def _questions_match(self, q1: str, q2: str) -> bool:
        """Check if two questions are similar enough to be the same market."""
        # Extract significant keywords (length > 3)
        words1 = set(w for w in q1.split() if len(w) > 3)
        words2 = set(w for w in q2.split() if len(w) > 3)
        
        # Calculate overlap
        if not words1 or not words2:
            return False
        
        overlap = len(words1 & words2)
        min_words = min(len(words1), len(words2))
        
        # Require at least 40% overlap
        return (overlap / min_words) >= 0.4
    
    def _process_matched_markets(
        self,
        matched_markets: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Process matched markets and calculate spreads."""
        processed = []
        
        for match in matched_markets:
            poly_market = match['polymarket']
            kalshi_market = match['kalshi']
            
            # Extract prices (pmxt returns prices as probabilities 0-1)
            poly_price = self._extract_price(poly_market)
            kalshi_price = self._extract_price(kalshi_market)
            
            if poly_price is None or kalshi_price is None:
                continue
            
            # Calculate spread
            spread = abs(poly_price - kalshi_price) * 100
            
            # Only include markets with spread > 5%
            if spread > 5.0:
                market = {
                    'id': f"{poly_market.get('id', 'p')}_{kalshi_market.get('id', 'k')}",
                    'question': match['question'],
                    'polymarket_price': round(poly_price * 100, 2),
                    'kalshi_price': round(kalshi_price * 100, 2),
                    'spread': round(spread, 2),
                    'is_unusual': spread > 10.0,
                    'polymarket_url': poly_market.get('url', f"https://polymarket.com/event/{poly_market.get('id', '')}"),
                    'kalshi_url': kalshi_market.get('url', f"https://kalshi.com/events/{kalshi_market.get('id', '')}"),
                    'last_updated': datetime.utcnow().isoformat(),
                    'trades': []  # Will be populated with trade data
                }
                processed.append(market)
        
        # Sort by spread descending
        processed.sort(key=lambda x: x['spread'], reverse=True)
        
        return processed
    
    def _extract_price(self, market: Dict[str, Any]) -> Optional[float]:
        """Extract the current price from a market object."""
        price = market.get('price')
        
        if price is not None:
            try:
                return float(price)
            except (ValueError, TypeError):
                pass
        
        return None
    
    async def fetch_recent_trades(
        self,
        market_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Fetch recent trades from both platforms.
        
        Args:
            market_id: Optional market ID to fetch trades for
            limit: Maximum number of trades to return
            
        Returns:
            List of recent trades
        """
        trades = []
        
        try:
            # Fetch trades from Polymarket
            poly_trades = await self._fetch_polymarket_trades(market_id, limit // 2)
            trades.extend(poly_trades)
            
            # Fetch trades from Kalshi
            kalshi_trades = await self._fetch_kalshi_trades(market_id, limit // 2)
            trades.extend(kalshi_trades)
            
            # Sort by time descending
            trades.sort(key=lambda x: x.get('trade_time', ''), reverse=True)
            
            return trades[:limit]
        except Exception as e:
            print(f"Error fetching trades: {e}")
            return []
    
    async def _fetch_polymarket_trades(
        self,
        market_id: Optional[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch recent trades from Polymarket."""
        try:
            # pmxt may have fetch_trades or similar method
            # For now, return empty list as we need to check exact API
            return []
        except Exception as e:
            print(f"Error fetching Polymarket trades: {e}")
            return []
    
    async def _fetch_kalshi_trades(
        self,
        market_id: Optional[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch recent trades from Kalshi."""
        try:
            # pmxt may have fetch_trades or similar method
            return []
        except Exception as e:
            print(f"Error fetching Kalshi trades: {e}")
            return []
