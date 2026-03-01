import type { NextApiRequest, NextApiResponse } from 'next'

type CronRunsResponse =
  | {
      dataSource: 'openclaw_cron_runs'
      available: true
      entries: any[]
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_cron_runs'
      available: false
      reason: string
      lastUpdated: string
    }

export default async function handler(req: NextApiRequest, res: NextApiResponse<CronRunsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) {
    return res.status(200).json({
      dataSource: 'openclaw_cron_runs',
      available: false,
      reason: 'Missing cron job id (use ?id=...)',
      lastUpdated: new Date().toISOString(),
    })
  }

  try {
    const { runOpenClawCommand } = await import('../_lib/openclaw')

    const out: string = await runOpenClawCommand(['cron', 'runs', '--id', id, '--limit', '50'], 10000)

    const data = JSON.parse(out)
    return res.status(200).json({
      dataSource: 'openclaw_cron_runs',
      available: true,
      entries: data?.entries || [],
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'openclaw_cron_runs',
      available: false,
      reason: `Failed to run openclaw cron runs --id ${id}: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
