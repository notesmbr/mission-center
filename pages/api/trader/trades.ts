import type { NextApiRequest, NextApiResponse } from 'next'
import type { TraderTradeRow } from '../../../lib/trader'

type TraderTradesResponse =
  | {
      available: true
      rows: TraderTradeRow[]
      lastUpdated: string
    }
  | {
      available: false
      reason: string
      lastUpdated: string
    }

export type TraderTradesDependencies = {
  getTraderHostAvailability: (options?: { requireState?: boolean; requireTrades?: boolean }) => { available: true } | { available: false; reason: string }
  normalizeTradesLimit: (raw: unknown, defaultLimit?: number, maxLimit?: number) => number
  readTraderTrades: (limit: number) => TraderTradeRow[]
  now: () => number
}

function readQueryParam(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return ''
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

function nowIso(deps: Pick<TraderTradesDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export async function buildTraderTradesResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: TraderTradesDependencies,
): Promise<{ statusCode: number; body: TraderTradesResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const availability = deps.getTraderHostAvailability({ requireTrades: true })
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

  try {
    const limit = deps.normalizeTradesLimit(readQueryParam(request.query?.limit), 200, 500)
    return {
      statusCode: 200,
      body: {
        available: true,
        rows: deps.readTraderTrades(limit),
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        available: false,
        reason: 'Failed to load trader trades.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TraderTradesDependencies> {
  const { getTraderHostAvailability, normalizeTradesLimit, readTraderTrades } = await import('../../../lib/trader')
  return {
    getTraderHostAvailability,
    normalizeTradesLimit,
    readTraderTrades,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TraderTradesResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildTraderTradesResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
