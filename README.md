# UnusualProbs - Prediction Market Aggregator

A full-stack application that aggregates and compares prediction markets from Polymarket and Kalshi, highlighting arbitrage opportunities and price divergences.

## Features

- 🔄 Real-time data fetching from Polymarket and Kalshi via public APIs
- 🤖 Background task that refreshes market data every 60 seconds
- 🔍 Fuzzy string matching to identify the same events across platforms
- 📊 Spread calculation between market prices
- 🎨 Dark-themed fintech dashboard UI with Tailwind CSS
- 🚨 Color-coded highlighting:
  - **Neon Red**: High divergence (>8% spread)
  - **Emerald Green**: Arbitrage opportunities (>3% spread)
- ⚡ Live-updating table with 5-second polling
- 📱 Responsive design that works on all devices

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **httpx**: Async HTTP client for API calls
- **thefuzz**: Fuzzy string matching for market comparison
- **Uvicorn**: ASGI server

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework

## Project Structure

```
Predication-Market/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── .gitignore
├── frontend/
│   ├── app/
│   │   ├── page.tsx        # Main dashboard page
│   │   ├── layout.tsx      # Root layout
│   │   └── globals.css     # Global styles
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── next.config.js
└── README.md
```

## Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 18+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the FastAPI server:
```bash
python main.py
```

The backend will be available at `http://localhost:8000`

#### Backend API Endpoints

- `GET /` - Root endpoint with API info
- `GET /api/markets` - Get all matched markets with spreads
- `GET /api/health` - Health check endpoint

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Running Both Services

For development, you'll need two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
python main.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Then open `http://localhost:3000` in your browser.

## How It Works

### Data Flow

1. **Background Task**: On startup, FastAPI initiates a background task that runs every 60 seconds
2. **Data Fetching**: The task attempts to fetch active markets from both Polymarket and Kalshi via their public APIs. If the APIs are unavailable (e.g., in development/sandboxed environments), it falls back to mock data for demonstration.
3. **Fuzzy Matching**: Markets are compared using fuzzy string matching (token_sort_ratio) to find the same events
4. **Spread Calculation**: For matched markets, the price difference (spread) is calculated
5. **API Exposure**: Matched markets are exposed via REST API endpoints
6. **Frontend Polling**: The Next.js frontend polls the API every 5 seconds for live updates
7. **Visual Highlighting**: Markets are color-coded based on spread percentage

> **Note**: The current implementation uses mock data when API access is unavailable. In production with proper API access, the application will fetch real-time market data from Polymarket and Kalshi.

### Matching Algorithm

Markets are matched between platforms using fuzzy string matching with a similarity threshold of 70%. The algorithm:

1. Compares each Polymarket market title with all Kalshi market titles
2. Uses `fuzz.token_sort_ratio()` to calculate similarity scores
3. Selects the best match above the threshold
4. Calculates the price spread as a percentage

### Color Coding Rules

- **High Divergence (Neon Red)**: Spread > 8%
  - Indicates significant price disagreement between platforms
- **Arbitrage Opportunity (Emerald Green)**: Spread > 3% and ≤ 8%
  - Potential profit opportunity by buying on one platform and selling on another
- **Normal (Gray)**: Spread ≤ 3%
  - Markets are reasonably aligned

## Development

### Backend Development

The backend uses FastAPI's lifespan context manager to handle the background task lifecycle:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background task
    global background_task
    background_task = asyncio.create_task(refresh_market_data())
    yield
    # Shutdown: Cancel background task
    background_task.cancel()
```

### Frontend Development

The frontend uses React hooks for state management and polling:

```typescript
useEffect(() => {
  fetchMarkets()
  const interval = setInterval(fetchMarkets, 5000)
  return () => clearInterval(interval)
}, [])
```

## Production Deployment

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm run build
npm start
```

## Configuration

### CORS

The backend allows all origins by default for development. For production, update the CORS middleware in `backend/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### API URL

For production, update the API URL in `frontend/app/page.tsx`:

```typescript
const response = await fetch('https://your-api-domain.com/api/markets')
```

## Troubleshooting

### Backend Issues

1. **pmxt import errors**: Ensure pmxt is properly installed
2. **No markets returned**: Check API credentials and rate limits
3. **Background task not running**: Check logs for errors

### Frontend Issues

1. **CORS errors**: Ensure backend CORS is configured correctly
2. **Connection refused**: Verify backend is running on port 8000
3. **No data displayed**: Check browser console for errors

## Future Enhancements

- Add authentication and API keys
- Implement WebSocket for real-time updates
- Add historical spread tracking and charts
- Include more prediction market platforms
- Add notification system for large spreads
- Implement market filters and search

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
