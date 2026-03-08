# 🌊 Mission Center - OpenClaw Local Dashboard

Real-time **local-only** monitoring for OpenClaw agents, cron jobs, and trader activity.

## Features

✅ **Real-Time Status** - OpenClaw and agent health monitoring  
✅ **Agents + Activity Feed** - Recent sessions + gateway log tail (redacted)  
✅ **Cron Jobs** - View cron list + recent runs  
✅ **Activity Logs** - Maintenance + trader logs  
✅ **Crypto Trader View** - Local-only status, positions, trades, and kill switch  
✅ **Setup Snapshot** - Local OpenClaw config summary
✅ **Global Skills View** - Filesystem-driven skill inventory with precedence (`workspace > shared > bundled`)

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
- `GET /api/agents/list` - Sanitized `sessions.recent` view
- `GET /api/activity/openclaw-log` - Redacted gateway activity feed
- `GET /api/openclaw-setup` - Local OpenClaw config snapshot
- `GET /api/cron/list` - Cron job list
- `GET /api/cron/runs?id=<id>` - Cron run history for a job
- `GET /api/logs/maintenance` - Maintenance log tail
- `GET /api/logs/trader` - Trader log tail
- `GET /api/trader/status` - Trader status from allowlisted files
- `GET /api/trader/trades?limit=<N>` - Recent trades from `trades.jsonl` (default 50, max 500)
- `POST /api/trader/kill-switch` - Enable/disable kill switch (`{ "enabled": true|false }`)
- `GET /api/skills/global` - Global skills scan (`~/.openclaw/skills`, bundled install path, `<workspace>/skills`) with precedence + invalid-skill reporting. Response entries include absolute local filesystem paths (`roots.*`, `skills[].path`, `invalid[].path`).

## Global Skills Sources

- `workspace`: `<workspace>/skills` (highest precedence)
- `shared`: `~/.openclaw/skills`
- `bundled`: resolved from `OPENCLAW_BUNDLED_SKILLS_DIR` first, otherwise auto-detected from common global install locations (lowest precedence)

If the same skill name exists in multiple sources, Mission Center marks the active version using:
`workspace > shared > bundled`.

## Filesystem/Security Notes

- The scanner only reads direct child directories under configured skill roots and only loads `SKILL.md` from each child.
- Paths are discovered from local filesystem directory entries; user input is not used for path construction.
- Missing or malformed skill folders are reported under `invalid` instead of crashing the endpoint.
- `OPENCLAW_BUNDLED_SKILLS_DIR` can be set to pin the bundled skills root explicitly in non-default installs.

## Trader File Contracts

- See [`docs/trader-files.md`](docs/trader-files.md) for the local file schema and path contract used by the Trader view.

## Deployment

Deployment configs are kept for reference, but Mission Center is intended to run locally on the same host as OpenClaw.

## License

MIT

---

Built for OpenClaw, tuned for local control.
