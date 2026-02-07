"""
Mock data generator for demonstration purposes.
In production, this would be replaced with actual pmxt library calls.
"""
import random
from typing import List, Dict, Any
from datetime import datetime


def generate_mock_markets() -> List[Dict[str, Any]]:
    """Generate mock market data for demonstration."""
    
    questions = [
        "Will Bitcoin reach $100,000 by end of 2024?",
        "Will the Fed cut interest rates in Q1 2024?",
        "Will AI surpass human performance in coding by 2025?",
        "Will SpaceX successfully land on Mars by 2026?",
        "Will global temperatures rise by 1.5°C by 2030?",
        "Will unemployment rate fall below 3% in 2024?",
        "Will a major cryptocurrency exchange fail in 2024?",
        "Will quantum computing breakthrough happen in 2024?",
        "Will Twitter rebrand be successful by end of 2024?",
        "Will renewable energy exceed 50% of US power by 2025?",
    ]
    
    markets = []
    
    for i, question in enumerate(questions):
        # Generate base price and add variation
        base_price = random.uniform(0.2, 0.8)
        
        # Create spread between platforms (some with >5%, some with >10%)
        spread_type = random.choice(['normal', 'high', 'unusual'])
        
        if spread_type == 'normal':
            spread = random.uniform(0.02, 0.05)  # 2-5%
        elif spread_type == 'high':
            spread = random.uniform(0.05, 0.10)  # 5-10%
        else:
            spread = random.uniform(0.10, 0.20)  # 10-20% (unusual)
        
        polymarket_price = base_price
        kalshi_price = base_price + spread if random.random() > 0.5 else base_price - spread
        
        # Ensure prices are in valid range
        kalshi_price = max(0.01, min(0.99, kalshi_price))
        
        market = {
            'id': f'market_{i+1}',
            'question': question,
            'polymarket_price': round(polymarket_price * 100, 2),
            'kalshi_price': round(kalshi_price * 100, 2),
            'spread': round(abs(polymarket_price - kalshi_price) * 100, 2),
            'is_unusual': abs(polymarket_price - kalshi_price) * 100 > 10.0,
            'polymarket_url': f'https://polymarket.com/event/mock-{i+1}',
            'kalshi_url': f'https://kalshi.com/events/mock-{i+1}',
            'last_updated': datetime.utcnow().isoformat()
        }
        
        # Only include if spread > 5%
        if market['spread'] > 5.0:
            markets.append(market)
    
    # Sort by spread descending
    markets.sort(key=lambda x: x['spread'], reverse=True)
    
    return markets
