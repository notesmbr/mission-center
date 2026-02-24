# 🚀 Mission Center - OpenClaw Command Dashboard

Real-time monitoring and cost tracking for OpenClaw agents and API usage.

## Features

✅ **Real-Time Status** - OpenClaw and agent health monitoring  
✅ **API Usage Tracking** - Token counts and costs by model  
✅ **Cost Breakdown** - Visual breakdown of spending by model  
✅ **Budget Analysis** - Smart recommendations to optimize costs  
✅ **Agent Management** - View all agents, models, and task history  

## Tech Stack

- **Frontend:** Next.js 14 + React 18
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **API:** OpenRouter (with manual tracking fallback)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenRouter API key (for real-time usage data)

### Installation

```bash
# Clone repo
cd mission-center

# Install dependencies
npm install

# Create .env.local with your API key
cp .env.example .env.local
# Edit .env.local and add your NEXT_PUBLIC_OPENROUTER_API_KEY
```

### Development

```bash
npm run dev
# Open http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

## Configuration

Edit `.env.local`:

```env
NEXT_PUBLIC_OPENROUTER_API_KEY=your_api_key_here
NEXT_PUBLIC_API_BASE_URL=https://your-deployed-url.com
```

## API Endpoints

- `GET /api/status` - OpenClaw and agent status
- `GET /api/usage` - Token and cost tracking
- `GET /api/budget` - Budget analysis (coming soon)

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Manual Deployment

```bash
npm run build
# Deploy the `.next` directory to your hosting
```

## Features Coming Soon

- 🔐 Real-time API data integration (automatic token tracking)
- 📊 Historical cost trends and forecasting
- 🎯 Custom budget limits and alerts
- 🔄 Agent scheduling and automation
- 📈 Performance metrics dashboard

## License

MIT

---

Built with ❤️ for OpenClaw
# Mission Center - Deploying to Vercel
// Force redeploy - Mon Feb 23 21:51:00 EST 2026
// Redeploying...
