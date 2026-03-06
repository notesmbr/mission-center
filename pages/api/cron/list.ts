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

export type CronListDependencies = {
  runOpenClawCommand: (args: string[], timeoutMs?: number) => Promise<string>
  now: () => number
}

function nowIso(deps: Pick<CronListDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export async function buildCronListResponse(
  request: Pick<NextApiRequest, 'method'>,
  deps: CronListDependencies,
): Promise<{ statusCode: number; body: CronListResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'openclaw_cron_list',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const out: string = await deps.runOpenClawCommand(['cron', 'list', '--json'], 8000)

    const data = JSON.parse(out)
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_cron_list',
        available: true,
        jobs: data?.jobs || [],
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_cron_list',
        available: false,
        reason: `Failed to run openclaw cron list --json: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<CronListDependencies> {
  const { runOpenClawCommand } = await import('../_lib/openclaw')
  return {
    runOpenClawCommand,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CronListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildCronListResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
