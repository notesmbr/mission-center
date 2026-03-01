import type { NextApiRequest, NextApiResponse } from 'next'

const LOG_PATH = '/Users/notesmbr/.openclaw/workspace/scripts/logs/maintenance.log'
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

function tailLines(text: string, maxLines: number) {
  const lines = text.split(/\r?\n/)
  const trimmed = lines.filter((line) => line.length > 0)
  const tail = trimmed.slice(-maxLines)
  return { tail: tail.join('\n'), lineCount: trimmed.length }
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
        path: LOG_PATH,
        lastUpdated: new Date().toISOString(),
      })
    }

    const text = fs.readFileSync(LOG_PATH, 'utf-8')
    const { tail, lineCount } = tailLines(text, MAX_LINES)

    return res.status(200).json({
      dataSource: 'local_log',
      available: true,
      path: LOG_PATH,
      tail,
      lineCount,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'local_log',
      available: false,
      reason: `Failed to read maintenance log: ${err?.message || String(err)}`,
      path: LOG_PATH,
      lastUpdated: new Date().toISOString(),
    })
  }
}
