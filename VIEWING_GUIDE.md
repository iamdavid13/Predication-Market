# 🔗 How to View UnusualProbs

## 📋 Quick Links

### GitHub Repository
- **Repository**: https://github.com/iamdavid13/Predication-Market
- **Pull Request**: https://github.com/iamdavid13/Predication-Market/pull/[PR_NUMBER]
- **Branch**: `copilot/build-prediction-market-aggregator-again`
- **Direct Branch View**: https://github.com/iamdavid13/Predication-Market/tree/copilot/build-prediction-market-aggregator-again

## 🚀 Viewing Options

### Option 1: Run Locally (Recommended)

The application is ready to run on your local machine:

#### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
**Access at**: http://localhost:8000

#### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
**Access at**: http://localhost:3000

#### View the Full Application
Once both are running, open your browser to:
**🌐 http://localhost:3000**

### Option 2: Deploy to Cloud

The application is deployment-ready for these platforms:

#### Frontend Deployment (Vercel - Recommended)
1. Fork the repository to your GitHub account
2. Visit https://vercel.com/new
3. Import your fork: `iamdavid13/Predication-Market`
4. Set root directory to: `frontend`
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL`: Your backend URL
6. Click Deploy

**Vercel will provide you a URL like**: https://unusualprobs.vercel.app

#### Backend Deployment (Railway - Recommended)
1. Visit https://railway.app/new
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Set root directory to: `backend`
5. Add start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Click Deploy

**Railway will provide you a URL like**: https://unusualprobs-production.up.railway.app

#### Alternative Platforms

**Frontend:**
- Netlify: https://app.netlify.com/start
- Cloudflare Pages: https://pages.cloudflare.com
- AWS Amplify: https://console.aws.amazon.com/amplify

**Backend:**
- Heroku: https://dashboard.heroku.com/new-app
- Render: https://render.com/new
- Google Cloud Run: https://cloud.google.com/run
- AWS Elastic Beanstalk: https://console.aws.amazon.com/elasticbeanstalk

### Option 3: Quick Demo with Screenshots

Since the application is running in the development environment, here are screenshots showing the live application:

📸 **Dashboard Screenshot**: Available in the PR description
- Shows 6 matched prediction markets
- High divergence market (Trump election, 11% spread) in neon red
- Arbitrage opportunities (3-4% spread) in emerald green
- Live status indicator with last update time
- Match confidence scores

## 🎯 What You'll See

When you view the application, you'll see:

1. **Header**
   - UnusualProbs branding
   - Real-time status indicator (success/error)
   - Last update timestamp

2. **Legend**
   - High Divergence (>8%) indicator
   - Arbitrage Opportunity (>3%) indicator

3. **Markets Table**
   - Market Title column with match confidence
   - Polymarket Price (%)
   - Kalshi Price (%)
   - Spread (%) with color coding

4. **Footer**
   - Total matched markets count
   - Platform indicators (Polymarket × Kalshi)

## 📱 Access Points

### API Endpoints
When backend is running:
- **Markets Data**: http://localhost:8000/api/markets
- **Health Check**: http://localhost:8000/api/health
- **API Docs**: http://localhost:8000/docs

### Source Code
- **Backend**: `/backend/main.py`
- **Frontend**: `/frontend/app/page.tsx`
- **Styles**: `/frontend/app/globals.css`

## 🔐 Security Note

If deploying to production:
1. Update CORS in `backend/main.py` to your frontend domain
2. Set `NEXT_PUBLIC_API_URL` environment variable
3. Use HTTPS for all connections
4. Consider adding rate limiting

## 📞 Need Help?

1. Check the [README.md](../README.md) for detailed setup instructions
2. Review [ARCHITECTURE.md](../ARCHITECTURE.md) for technical details
3. All dependencies are listed in:
   - Backend: `backend/requirements.txt`
   - Frontend: `frontend/package.json`

## ✅ Verification Checklist

Before viewing, ensure:
- [ ] Backend is running on port 8000
- [ ] Frontend is running on port 3000
- [ ] No errors in terminal/console
- [ ] Browser opened to http://localhost:3000
- [ ] Markets data is loading (shows success status)

---

**Built with**: FastAPI + Next.js 15.5.12 + Tailwind CSS
**Repository**: https://github.com/iamdavid13/Predication-Market
