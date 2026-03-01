import type { NextApiRequest, NextApiResponse } from 'next'

// Deprecated webhook endpoint.
// This local dashboard now focuses on *current local OpenClaw status*.
// Keeping this endpoint as a harmless no-op avoids breaking old webhook senders.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  // Drain body best-effort
  try {
    await new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => (data += chunk))
      req.on('end', resolve)
      req.on('error', resolve)
    })
  } catch {}

  res.status(200).json({
    ok: true,
    deprecated: true,
    reason: 'openrouter webhook is deprecated on this local dashboard instance.',
    lastUpdated: new Date().toISOString(),
  })
}
