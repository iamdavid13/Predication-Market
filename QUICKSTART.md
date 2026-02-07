# Quick Start Guide

This guide will help you get the UnusualProbs site running at localhost:3000 in under 5 minutes.

## Prerequisites
- Python 3.8+
- Node.js 18+
- npm

## Important: Install PMXT Sidecar (Required for Real-Time Data)

For real-time market data from Polymarket and Kalshi, install the pmxt sidecar server globally:

```bash
npm install -g pmxtjs
```

**Note:** Without this, the app will fall back to mock data. The pmxt library requires this Node.js server to interact with prediction markets.

## Step-by-Step Instructions

### 1. Clone the Repository (if you haven't already)
```bash
git clone https://github.com/iamdavid13/Predication-Market.git
cd Predication-Market
```

### 2. Start the Backend Server

Open a terminal and run:

```bash
cd backend
pip install -r requirements.txt
python3 main.py
```

✅ You should see: `INFO:     Application startup complete.`

The backend is now running at `http://localhost:8000`

### 3. Start the Frontend Server

Open a **NEW** terminal (keep the backend running) and run:

```bash
cd frontend
npm install
npm run dev
```

✅ You should see: `▲ Next.js 16.1.6` and `- Local: http://localhost:3000`

### 4. Access the Site

Open your web browser and go to:
```
http://localhost:3000
```

🎉 You should now see the UnusualProbs dashboard!

## Expected Result

You should see:
- UnusualProbs navigation bar at the top
- Live timestamp showing current time
- Three info cards (Live Opportunity, High Volatility, AVG. SPREAD)
- Active Markets table with prediction market data
- Markets refreshing every 30 seconds

## Quick Test

To verify everything is working:

1. **Backend Health Check:**
   ```bash
   curl http://localhost:8000/api/health
   ```
   Should return: `{"status":"healthy","timestamp":"..."}`

2. **Markets API:**
   ```bash
   curl http://localhost:8000/api/markets
   ```
   Should return JSON with market data

3. **Frontend:** Navigate to http://localhost:3000 in your browser

## Troubleshooting

### Problem: "Cannot access localhost:3000"

**Solution:**
1. Make sure BOTH terminals are running (backend AND frontend)
2. Check if you ran `npm install` in the frontend directory
3. Verify no errors in the terminal output

### Problem: "Port already in use"

**Solution:**
```bash
# Kill process on port 3000
lsof -ti :3000 | xargs kill -9

# Kill process on port 8000
lsof -ti :8000 | xargs kill -9
```

Then restart the servers.

### Problem: "Module not found" errors

**Solution:**
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
rm -rf node_modules
npm install
```

## Next Steps

- Explore the dashboard and see live market data
- Click on P/K buttons to visit Polymarket and Kalshi markets
- Try the "Connect Wallet" feature
- Watch the live timestamp and market updates

## Need More Help?

See the full [README.md](README.md) for detailed documentation and troubleshooting.
