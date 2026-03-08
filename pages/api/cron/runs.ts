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

export type CronRunsDependencies = {
  runOpenClawCommand: (args: string[], timeoutMs?: number) => Promise<string>
  now: () => number
}

function readQueryParam(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return ''
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

function nowIso(deps: Pick<CronRunsDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export async function buildCronRunsResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: CronRunsDependencies,
): Promise<{ statusCode: number; body: CronRunsResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'openclaw_cron_runs',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const id = readQueryParam(request.query?.id)
  if (!id) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_cron_runs',
        available: false,
        reason: 'Missing cron job id (use ?id=...)',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const out: string = await deps.runOpenClawCommand(['cron', 'runs', '--id', id, '--limit', '50'], 10000)

    const data = JSON.parse(out)
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_cron_runs',
        available: true,
        entries: data?.entries || [],
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_cron_runs',
        available: false,
        reason: `Failed to run openclaw cron runs --id ${id}: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<CronRunsDependencies> {
  const { runOpenClawCommand } = await import('../_lib/openclaw')
  return {
    runOpenClawCommand,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CronRunsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildCronRunsResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
