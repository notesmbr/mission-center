# 🌊 Samoas Control - OpenClaw Local Dashboard

Real-time **local-only** monitoring for OpenClaw agents, cron jobs, and trader activity.

## Features

✅ **Real-Time Status** - OpenClaw and agent health monitoring  
✅ **Cron Jobs** - View cron list + recent runs  
✅ **Activity Logs** - Maintenance + trader logs  
✅ **Crypto Trader Panel** - Read-only view of `trader.log`  
✅ **Setup Snapshot** - Local OpenClaw config summary

## Tech Stack

- **Frontend:** Next.js 14 + React 18
- **Styling:** Tailwind CSS
- **Charts:** Recharts

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenClaw CLI available on the same host

### Installation

```bash
cd mission-center
npm install
```

### Local Development (local-only)

```bash
npm run dev
# Open http://localhost:3000
```

Or use the helper script (binds to 127.0.0.1):

```bash
./serve-dashboard.sh
```

## API Endpoints

- `GET /api/status` - OpenClaw and agent status
- `GET /api/openclaw-setup` - Local OpenClaw config snapshot
- `GET /api/cron/list` - Cron job list
- `GET /api/cron/runs?id=<id>` - Cron run history for a job
- `GET /api/logs/maintenance` - Maintenance log tail
- `GET /api/logs/trader` - Trader log tail

## Deployment

Deployment configs are kept for reference, but Samoas Control is intended to run locally on the same host as OpenClaw.

## License

MIT

---

Built for OpenClaw, tuned for local control.
