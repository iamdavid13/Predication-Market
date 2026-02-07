# UnusualProbs - Architecture & Design

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │   Dashboard UI (React + Tailwind CSS)                   │ │
│  │   - Live-updating table (5-second polling)              │ │
│  │   - Color-coded highlighting                            │ │
│  │   - Responsive design                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST API
                         │ GET /api/markets
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │   REST API Layer                                        │ │
│  │   - /api/markets  - /api/health  - /                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │   Background Task (60-second refresh)                   │ │
│  │   ┌──────────────┐  ┌──────────────┐                   │ │
│  │   │  Polymarket  │  │    Kalshi    │                   │ │
│  │   │  API Client  │  │  API Client  │                   │ │
│  │   └──────────────┘  └──────────────┘                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │   Market Matching Engine                                │ │
│  │   - Fuzzy string matching (thefuzz)                     │ │
│  │   - Spread calculation                                  │ │
│  │   - Sorting by divergence                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Background Task Initialization**
   - On startup, FastAPI creates a background asyncio task
   - Task runs every 60 seconds indefinitely

2. **Market Data Fetching**
   - Two parallel async requests to Polymarket and Kalshi APIs
   - If APIs fail, falls back to mock data for demonstration
   - Each market is normalized to a common format:
     ```python
     {
       "id": str,
       "title": str,
       "price": float (0-1 range),
       "platform": str
     }
     ```

3. **Market Matching**
   - Uses fuzzy string matching with 70% similarity threshold
   - Algorithm: `fuzz.token_sort_ratio()` from thefuzz library
   - For each Polymarket market, finds best matching Kalshi market
   - Only pairs with similarity > 70% are kept

4. **Spread Calculation**
   - Spread = |Polymarket Price - Kalshi Price| × 100
   - Results sorted by spread (descending)
   - Returns matched markets with metadata:
     ```python
     {
       "title": str,
       "polymarket_price": float (0-100),
       "kalshi_price": float (0-100),
       "spread": float,
       "similarity_score": int (0-100),
       "polymarket_id": str,
       "kalshi_id": str
     }
     ```

5. **API Response**
   - Markets exposed via `/api/markets` endpoint
   - Includes metadata: last_update, status, count

6. **Frontend Rendering**
   - React component fetches data every 5 seconds
   - Applies color coding rules:
     - Spread > 8%: Neon red (high divergence)
     - Spread > 3%: Emerald green (arbitrage opportunity)
     - Spread ≤ 3%: Gray (normal)

## Key Technologies

### Backend
- **FastAPI**: Async web framework with automatic OpenAPI docs
- **Uvicorn**: ASGI server for running FastAPI
- **httpx**: Async HTTP client for API calls
- **thefuzz**: Fuzzy string matching (Python port of FuzzyWuzzy)
- **python-Levenshtein**: Fast string comparison backend

### Frontend
- **Next.js 14**: React framework with App Router
- **React 18**: Component-based UI
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first styling

## Design Decisions

### Why Fuzzy Matching?
Markets on different platforms often have slightly different titles:
- "Will Bitcoin reach $100k by March 2026?" (Polymarket)
- "Bitcoin to hit $100k by March 2026?" (Kalshi)

Fuzzy matching allows us to identify these as the same event despite minor wording differences.

### Why 60-Second Refresh?
- Balance between real-time updates and API rate limits
- Prediction markets don't change rapidly like stock prices
- Reduces server load while maintaining freshness

### Why 5-Second Frontend Polling?
- Provides near-real-time updates to users
- More responsive than 60-second updates
- Fetches from cache (backend memory), not external APIs

### Color Coding Thresholds
- **>8% spread**: Significant divergence indicating potential market inefficiency
- **>3% spread**: Practical arbitrage opportunity after accounting for fees
- **≤3% spread**: Normal market alignment

## Performance Characteristics

- **Backend Memory**: ~50-100MB for typical workload
- **API Response Time**: <50ms (serving from memory)
- **Market Matching**: O(n×m) where n=Polymarket markets, m=Kalshi markets
- **Frontend Bundle**: ~400KB gzipped
- **Time to Interactive**: <2 seconds on broadband

## Scalability Considerations

### Current Limitations
- In-memory storage (not persistent)
- Single background task (not distributed)
- No caching layer between frontend and backend

### Future Improvements
- Add Redis for distributed caching
- Store historical spread data in PostgreSQL
- Implement WebSocket for real-time updates
- Add horizontal scaling with load balancer
- Implement circuit breakers for external APIs

## Security Model

### Current Implementation
- CORS configured for development (allow all origins)
- No authentication required
- Public read-only API
- No sensitive data stored

### Production Recommendations
1. Restrict CORS to specific frontend domain
2. Add rate limiting (e.g., 100 requests/minute per IP)
3. Implement API key authentication if needed
4. Add HTTPS/TLS for all connections
5. Sanitize error messages to avoid information leakage
6. Monitor for abuse patterns

## Monitoring & Observability

### Available Endpoints
- `GET /`: API information
- `GET /api/markets`: Get matched markets
- `GET /api/health`: Health check with status and market count

### Logging
- INFO: Normal operations, market updates
- WARNING: API failures, fallback to mock data
- ERROR: Unexpected exceptions

### Key Metrics to Track (in production)
- API response times
- Market matching success rate
- External API availability
- Frontend error rates
- User engagement (page views, session duration)

## Development Workflow

1. **Local Development**
   ```bash
   # Terminal 1: Backend
   cd backend && source venv/bin/activate && python main.py
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

2. **Testing**
   - Backend: Use curl or Postman to test endpoints
   - Frontend: Visit http://localhost:3000
   - Integration: Verify live updates every 5 seconds

3. **Deployment**
   - Backend: Deploy to any Python ASGI host (Heroku, Railway, etc.)
   - Frontend: Deploy to Vercel, Netlify, or any static host
   - Set environment variables for production URLs

## API Documentation

Once running, visit http://localhost:8000/docs for interactive OpenAPI documentation.
