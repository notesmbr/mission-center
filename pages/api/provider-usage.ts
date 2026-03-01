import type { NextApiRequest, NextApiResponse } from 'next'

// This project is intended to reflect OpenClaw local status.
// Provider-specific usage endpoints were removed for security and accuracy.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.status(200).json({
    available: false,
    reason: 'Provider-specific usage has been removed. Use /api/status (openclaw status --json) and /api/openclaw-setup instead.',
    lastUpdated: new Date().toISOString(),
  })
}
