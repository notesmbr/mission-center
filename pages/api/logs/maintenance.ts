import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

import { tailFileLines } from '../_lib/activity'
import { WORKSPACE_ROOT } from '../_lib/paths'

const LOG_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'logs', 'maintenance.log')
const PATH_HINT = 'scripts/logs/maintenance.log'
const MAX_LINES = 200

type LogResponse =
  | {
      dataSource: 'local_log'
      available: true
      path: string
      tail: string
      lineCount: number
      lastUpdated: string
    }
  | {
      dataSource: 'local_log'
      available: false
      reason: string
      path: string
      lastUpdated: string
    }

export default async function handler(req: NextApiRequest, res: NextApiResponse<LogResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const fs = await import('fs')
    if (!fs.existsSync(LOG_PATH)) {
      return res.status(200).json({
        dataSource: 'local_log',
        available: false,
        reason: 'Maintenance log not found on this host.',
        path: PATH_HINT,
        lastUpdated: new Date().toISOString(),
      })
    }

    const { tail, lineCountEstimate } = tailFileLines(LOG_PATH, MAX_LINES)

    return res.status(200).json({
      dataSource: 'local_log',
      available: true,
      path: PATH_HINT,
      tail,
      lineCount: lineCountEstimate,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'local_log',
      available: false,
      reason: `Failed to read maintenance log: ${err?.message || String(err)}`,
      path: PATH_HINT,
      lastUpdated: new Date().toISOString(),
    })
  }
}
