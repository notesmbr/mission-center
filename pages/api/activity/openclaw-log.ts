import fs from 'fs'
import type { NextApiRequest, NextApiResponse } from 'next'

type ActivityLogResponse =
  | {
      dataSource: 'openclaw_gateway_logs'
      available: true
      stream: 'gateway' | 'gateway_err' | 'both'
      logs: Array<{
        id: 'gateway' | 'gatewayErr'
        path: string
        exists: boolean
        lineCount: number
        tail: string
      }>
      combinedTail: string
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_gateway_logs'
      available: false
      stream: 'gateway' | 'gateway_err' | 'both'
      reason: string
      lastUpdated: string
    }

function normalizeStream(queryValue: unknown): 'gateway' | 'gateway_err' | 'both' {
  const stream = String(queryValue || 'both').toLowerCase()
  if (stream === 'gateway') return 'gateway'
  if (stream === 'gateway_err' || stream === 'gatewayerr' || stream === 'stderr') return 'gateway_err'
  return 'both'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ActivityLogResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  const stream = normalizeStream(req.query.stream)

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      dataSource: 'openclaw_gateway_logs',
      available: false,
      stream,
      reason: `Method ${req.method} not allowed`,
      lastUpdated: new Date().toISOString(),
    })
  }

  try {
    const {
      OPENCLAW_ACTIVITY_LOGS,
      combineLogTails,
      isAllowedActivityLogPath,
      redactTokenLikeStrings,
      resolveActivityLogIds,
      tailLines,
    } = await import('../_lib/activity')

    const selected = resolveActivityLogIds(stream)
    const requestedLines = Number(req.query.lines)
    const maxLines = Number.isFinite(requestedLines) ? Math.max(20, Math.min(500, Math.floor(requestedLines))) : 200
    const perLogLines = Math.max(20, Math.floor(maxLines / selected.length))

    const logs = selected.map((id) => {
      const path = OPENCLAW_ACTIVITY_LOGS[id]

      // Defense-in-depth: only allow exact known paths.
      if (!isAllowedActivityLogPath(path)) {
        return {
          id,
          path,
          exists: false,
          lineCount: 0,
          tail: '',
        }
      }

      if (!fs.existsSync(path)) {
        return {
          id,
          path,
          exists: false,
          lineCount: 0,
          tail: '',
        }
      }

      const text = fs.readFileSync(path, 'utf-8')
      const { lineCount, tail } = tailLines(text, perLogLines)
      return {
        id,
        path,
        exists: true,
        lineCount,
        tail: redactTokenLikeStrings(tail),
      }
    })

    if (!logs.some((l) => l.exists)) {
      return res.status(200).json({
        dataSource: 'openclaw_gateway_logs',
        available: false,
        stream,
        reason: 'OpenClaw gateway logs not found on this host.',
        lastUpdated: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      dataSource: 'openclaw_gateway_logs',
      available: true,
      stream,
      logs,
      combinedTail: combineLogTails(logs),
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'openclaw_gateway_logs',
      available: false,
      stream,
      reason: `Failed to read OpenClaw activity logs: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
