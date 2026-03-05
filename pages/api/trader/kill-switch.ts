import type { NextApiRequest, NextApiResponse } from 'next'

type TraderKillSwitchResponse =
  | {
      available: true
      killSwitchEnabled: boolean
      lastUpdated: string
    }
  | {
      available: false
      reason: string
      lastUpdated: string
    }

export type TraderKillSwitchDependencies = {
  getTraderHostAvailability: (options?: { requireState?: boolean; requireTrades?: boolean }) => { available: true } | { available: false; reason: string }
  setKillSwitchEnabled: (enabled: boolean) => boolean
  now: () => number
}

function nowIso(deps: Pick<TraderKillSwitchDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function readEnabledBodyValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

export async function buildTraderKillSwitchResponse(
  request: Pick<NextApiRequest, 'method' | 'body'>,
  deps: TraderKillSwitchDependencies,
): Promise<{ statusCode: number; body: TraderKillSwitchResponse }> {
  if (request.method && request.method !== 'POST') {
    return {
      statusCode: 405,
      body: {
        available: false,
        reason: 'Method not allowed. Use POST.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const availability = deps.getTraderHostAvailability()
  if (!availability.available) {
    return {
      statusCode: 200,
      body: {
        available: false,
        reason: availability.reason,
        lastUpdated: nowIso(deps),
      },
    }
  }

  const enabled = readEnabledBodyValue(request.body?.enabled)
  if (enabled === null) {
    return {
      statusCode: 400,
      body: {
        available: false,
        reason: 'Invalid request body. Expected JSON object with boolean field: enabled.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    return {
      statusCode: 200,
      body: {
        available: true,
        killSwitchEnabled: deps.setKillSwitchEnabled(enabled),
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        available: false,
        reason: 'Failed to update trader kill switch.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TraderKillSwitchDependencies> {
  const { getTraderHostAvailability, setKillSwitchEnabled } = await import('../../../lib/trader')
  return {
    getTraderHostAvailability,
    setKillSwitchEnabled,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TraderKillSwitchResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
  }

  const deps = await loadDependencies()
  const result = await buildTraderKillSwitchResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
