# Mission Center - Setup Guide

Your Mission Center dashboard is ready! Follow these steps to get it live.

## Step 1: Create GitHub Account & Repository

1. Go to https://github.com/signup
2. Create an account (use your email)
3. Create a **New Repository**:
   - Name: `mission-center`
   - Description: "OpenClaw Mission Control Dashboard"
   - Make it **Public** (for free Vercel deployment)
   - Don't initialize with README (we have one)

4. After creating the repo, you'll see setup instructions. Copy your repo URL (should be `https://github.com/YOUR_USERNAME/mission-center`)

## Step 2: Push Code to GitHub

Once you have your GitHub repo URL, run this:

```bash
cd /Users/notesmbr/.openclaw/workspace/mission-center

# Change the remote to YOUR repo
git remote add origin https://github.com/YOUR_USERNAME/mission-center

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## Step 3: Create Vercel Account & Deploy

1. Go to https://vercel.com/signup
2. Click "Continue with GitHub" and authorize
3. Click "Import Project"
4. Select your `mission-center` repository from GitHub
5. Click "Import"

### Vercel Environment Variables

When prompted for environment variables, add:

```
NEXT_PUBLIC_OPENROUTER_API_KEY = your_openrouter_api_key
```

6. Click "Deploy"
7. Wait ~2 minutes for the build to complete

## Step 4: Configure Real-Time API Tracking

Once deployed, you can add real-time API usage tracking:

1. Get your **OpenRouter API Key**: https://openrouter.ai/keys
2. Add it to Vercel's environment variables:
   - Go to your Vercel project → Settings → Environment Variables
   - Add `NEXT_PUBLIC_OPENROUTER_API_KEY`

## Step 5: Your Live Dashboard

After deployment, Vercel will give you a URL like:
```
https://mission-center-xxxxx.vercel.app
```

This is your live Mission Center! 🎉

---

## What Brooke Has Built

### Components
- **Status Tab**: Real-time OpenClaw & agent status
- **API Usage Tab**: Token tracking by model with cost breakdown
- **Budget Analysis Tab**: Smart cost recommendations & budget tracking

### Features
- 📊 Auto-refreshing data every 10 seconds
- 💰 Cost tracking by model
- 🎯 Budget recommendations based on spending
- 📈 Visual charts and breakdowns
- 🔐 Secure API key handling

### API Endpoints (Ready to Connect)
- `/api/status` - Agent status and uptime
- `/api/usage` - Token counts and costs
- `/api/budget` - Budget analysis and recommendations

---

## Next Steps

1. **Add Real-Time Data**: Connect OpenRouter API for automatic token tracking
2. **Enhance Agent Data**: Fetch actual OpenClaw agent status from the daemon
3. **Custom Models**: Add your own models and agents to the tracking dashboard
4. **Alerting**: Set up notifications when budget thresholds are hit
5. **Historical Data**: Store and display cost trends over time

---

## Questions?

Check the `/Users/notesmbr/.openclaw/workspace/mission-center` folder for:
- `README.md` - Full feature list
- `package.json` - Dependencies and scripts
- `pages/` - All page and API code
- `components/` - Reusable UI components
