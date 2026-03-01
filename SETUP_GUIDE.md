# Mission Center - Setup Guide

Mission Center is intended to run **locally** on the same host as OpenClaw.

## Quick Start

```bash
cd /Users/notesmbr/.openclaw/workspace/mission-center
npm install
npm run dev
# Open http://localhost:3000
```

Or use the helper script (binds to 127.0.0.1 and restarts if needed):

```bash
./serve-dashboard.sh
```

## Notes

- The dashboard reads local OpenClaw status via the CLI.
- Logs are read from:
  - `/Users/notesmbr/.openclaw/workspace/scripts/logs/maintenance.log`
  - `/Users/notesmbr/.openclaw/workspace/trader.log`
- Deployment configs are kept for reference, but this UI is local-only.

## API Endpoints

- `/api/status`
- `/api/openclaw-setup`
- `/api/cron/list`
- `/api/cron/runs?id=<id>`
- `/api/logs/maintenance`
- `/api/logs/trader`
