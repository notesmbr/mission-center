import type { NextApiRequest, NextApiResponse } from 'next'
import type { TraderTradeRow } from '../../../lib/trader'

type TraderMetricsResponse =
  | {
      available: true
      limit: number
      tradeCount: number
      totalPnlUsd: number | null
      winRate: number | null
      avgPnlUsd: number | null
      profitFactor: number | null
      maxDrawdownUsd: number | null
      tradesPerDay: number | null
      lastUpdated: string
    }
  | {
      available: false
      reason: string
      lastUpdated: string
    }

export type TraderMetricsDependencies = {
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

function nowIso(deps: Pick<TraderMetricsDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function toMs(ts: string | null): number | null {
  if (!ts) return null
  const ms = Date.parse(ts)
  return Number.isFinite(ms) ? ms : null
}

function computeMetrics(rows: TraderTradeRow[]) {
  const withPnl = rows.filter((r) => typeof r.pnlUsd === 'number' && Number.isFinite(r.pnlUsd))
  if (!withPnl.length) {
    return {
      tradeCount: rows.length,
      totalPnlUsd: null,
      winRate: null,
      avgPnlUsd: null,
      profitFactor: null,
      maxDrawdownUsd: null,
      tradesPerDay: null,
    }
  }

  let total = 0
  let wins = 0
  let grossProfit = 0
  let grossLoss = 0

  // drawdown from pnl curve
  let equity = 0
  let peak = 0
  let maxDd = 0

  // sort oldest->newest by close time when available
  const sorted = [...withPnl].sort((a, b) => {
    const am = toMs(a.closeTs) ?? 0
    const bm = toMs(b.closeTs) ?? 0
    return am - bm
  })

  for (const row of sorted) {
    const pnl = row.pnlUsd as number
    total += pnl
    if (pnl > 0) {
      wins += 1
      grossProfit += pnl
    } else if (pnl < 0) {
      grossLoss += Math.abs(pnl)
    }

    equity += pnl
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDd) maxDd = dd
  }

  const winRate = wins / withPnl.length
  const avg = total / withPnl.length
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null

  // trades/day over observed window
  const times = sorted.map((r) => toMs(r.closeTs)).filter((x): x is number => typeof x === 'number')
  let tradesPerDay: number | null = null
  if (times.length >= 2) {
    const spanDays = Math.max(1 / 24, (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24))
    tradesPerDay = sorted.length / spanDays
  }

  return {
    tradeCount: rows.length,
    totalPnlUsd: total,
    winRate,
    avgPnlUsd: avg,
    profitFactor,
    maxDrawdownUsd: maxDd,
    tradesPerDay,
  }
}

export async function buildTraderMetricsResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: TraderMetricsDependencies,
): Promise<{ statusCode: number; body: TraderMetricsResponse }> {
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
    const limit = deps.normalizeTradesLimit(readQueryParam(request.query?.limit), 500, 2000)
    const rows = deps.readTraderTrades(limit)
    const metrics = computeMetrics(rows)
    return {
      statusCode: 200,
      body: {
        available: true,
        limit,
        ...metrics,
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        available: false,
        reason: 'Failed to compute trader metrics.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TraderMetricsDependencies> {
  const { getTraderHostAvailability, normalizeTradesLimit, readTraderTrades } = await import('../../../lib/trader')
  return {
    getTraderHostAvailability,
    normalizeTradesLimit,
    readTraderTrades,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TraderMetricsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildTraderMetricsResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
