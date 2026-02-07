# UnusualProbs - Prediction Market Aggregator

A full-stack prediction market aggregator that tracks and displays price differences (spreads) between Polymarket and Kalshi markets. Built with FastAPI (Python) and Next.js (TypeScript).

## Features

- 🔴 **Unusual Markets**: Automatically flags markets with spreads > 10% as "UNUSUAL"
- 📊 **Live Updates**: Auto-refreshes market data every 30 seconds
- 🎨 **Dark Fintech Theme**: Sleek, professional interface optimized for traders
- 🔍 **Smart Filtering**: Only shows markets with spreads > 5%
- 📈 **Real-time Spreads**: Calculates and displays price differences between platforms

## Project Structure

```
Prediction-Market/
├── backend/           # FastAPI Python backend
│   ├── main.py        # Main API server
│   ├── mock_data.py   # Mock data generator (for demo)
│   └── requirements.txt
├── frontend/          # Next.js TypeScript frontend
│   ├── app/           # Next.js app directory
│   ├── components/    # React components
│   └── package.json
└── README.md
```

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **Python 3.8+**: Backend language
- **pmxt**: Library for matching Polymarket and Kalshi events (or mock data)
- **Uvicorn**: ASGI server

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **React**: UI library

## Installation

### Prerequisites
- Python 3.8 or higher
- Node.js 18 or higher
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Run the backend server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

#### API Endpoints

- `GET /` - API information
- `GET /api/markets` - Fetch all markets with spread > 5%
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

## Usage

1. Start the backend server first (on port 8000)
2. Start the frontend server (on port 3000)
3. Open your browser to `http://localhost:3000`
4. View live markets with spreads > 5%
5. Markets with spreads > 10% will be tagged as "UNUSUAL" in red

## How It Works

1. **Backend** fetches market data from Polymarket and Kalshi APIs
2. **Event Matching** uses the pmxt library to match similar events across platforms
3. **Spread Calculation** computes the price difference between matched markets
4. **Filtering** only returns markets with spreads > 5%
5. **Frontend** displays the data in a live-updating table with auto-refresh every 30 seconds

## Configuration

### Backend
Edit `backend/main.py` to configure:
- CORS origins
- Port number
- API rate limiting

### Frontend
Edit `frontend/components/MarketsTable.tsx` to configure:
- API endpoint URL
- Refresh interval (default: 30 seconds)
- Spread thresholds

## Development

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

## Production Deployment

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Frontend
```bash
cd frontend
npm run build
npm start
```

## Environment Variables

Create a `.env` file in the backend directory:
```env
# Add API keys if needed
POLYMARKET_API_KEY=your_key_here
KALSHI_API_KEY=your_key_here
```

## License

MIT

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Support

For issues or questions, please open an issue on GitHub.

## Troubleshooting

### Issue: Can't see the site at localhost:3000

If you're unable to access the site at `http://localhost:3000`, follow these steps:

1. **Check if both servers are running:**
   - Backend should be running on port 8000
   - Frontend should be running on port 3000

2. **Verify backend is running:**
   ```bash
   curl http://localhost:8000/api/health
   ```
   You should see: `{"status":"healthy","timestamp":"..."}`

3. **Check if frontend dependencies are installed:**
   ```bash
   cd frontend
   ls node_modules
   ```
   If `node_modules` doesn't exist, run: `npm install`

4. **Restart the servers:**
   
   **Backend:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python3 main.py
   ```
   
   **Frontend (in a new terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Check if ports are already in use:**
   ```bash
   # Check port 3000
   lsof -i :3000
   
   # Check port 8000
   lsof -i :8000
   ```
   
   If ports are in use by other processes, either stop those processes or change the port numbers.

6. **Verify you're in the correct directory:**
   Make sure you're running commands from the project root directory or the appropriate subdirectory (backend or frontend).

### Common Solutions

- **Backend not starting:** Ensure Python dependencies are installed: `pip install -r backend/requirements.txt`
- **Frontend not starting:** Delete `node_modules` and reinstall: `rm -rf frontend/node_modules && cd frontend && npm install`
- **Connection refused:** Make sure both servers are running before accessing localhost:3000
- **Blank page:** Check browser console for errors and ensure backend API is accessible
