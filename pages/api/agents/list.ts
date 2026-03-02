import type { NextApiRequest, NextApiResponse } from 'next'
import { makeAgentsListFailure, makeAgentsListSuccess, sanitizeRecentSessions } from '../_lib/agents'
import { runOpenClawCommand } from '../_lib/openclaw'
import type { AgentsListResponse } from '../_lib/agents'

export default async function handler(req: NextApiRequest, res: NextApiResponse<AgentsListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      dataSource: 'openclaw_status_recent',
      available: false,
      reason: `Method ${req.method} not allowed`,
      lastUpdated: new Date().toISOString(),
    })
  }

  try {
    const out = await runOpenClawCommand(['status', '--json'], 5000)
    const data = JSON.parse(out)

    const sessions = sanitizeRecentSessions(data?.sessions?.recent)
    return res.status(200).json(makeAgentsListSuccess(sessions))
  } catch (err: any) {
    return res
      .status(200)
      .json(makeAgentsListFailure(`Failed to read openclaw sessions: ${err?.message || String(err)}`))
  }
}
