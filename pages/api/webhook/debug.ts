import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const logFile = path.join(process.cwd(), '.data', 'webhook-debug.log')

const ensureDataDir = () => {
  const dir = path.dirname(logFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    ensureDataDir()

    const logEntry = {
      timestamp: new Date().toISOString(),
      payload: req.body,
    }

    // Append to log file
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8') : ''
    const entries = log.trim() ? JSON.parse(`[${log.trim().split('\n').join(',')}]`) : []
    entries.push(logEntry)

    // Keep last 100 entries
    const recent = entries.slice(-100)
    fs.writeFileSync(
      logFile,
      recent.map((e: any) => JSON.stringify(e)).join('\n')
    )

    res.status(200).json({ status: 'logged', entries: recent.length })
  } catch (error) {
    console.error('Debug log error:', error)
    res.status(500).json({ error: String(error) })
  }
}
