import type { NextApiRequest, NextApiResponse } from 'next'

// Deprecated: this dashboard now pulls *current* data from local `openclaw status --json`.
// Provider-specific spend endpoints easily become stale and can leak secrets.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  res.status(200).json({
    available: false,
    deprecated: true,
    reason: 'Usage view removed. Use /api/status for current local OpenClaw status.',
    lastUpdated: new Date().toISOString(),
  })
}
