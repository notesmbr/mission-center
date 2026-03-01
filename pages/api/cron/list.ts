import type { NextApiRequest, NextApiResponse } from 'next'

type CronListResponse =
  | {
      dataSource: 'openclaw_cron_list'
      available: true
      jobs: any[]
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_cron_list'
      available: false
      reason: string
      lastUpdated: string
    }

export default async function handler(req: NextApiRequest, res: NextApiResponse<CronListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const { execFile } = await import('child_process')

    const out: string = await new Promise((resolve, reject) => {
      execFile('openclaw', ['cron', 'list', '--json'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message))
        resolve(stdout)
      })
    })

    const data = JSON.parse(out)
    return res.status(200).json({
      dataSource: 'openclaw_cron_list',
      available: true,
      jobs: data?.jobs || [],
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'openclaw_cron_list',
      available: false,
      reason: `Failed to run openclaw cron list --json: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
