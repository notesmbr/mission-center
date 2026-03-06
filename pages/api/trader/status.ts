import type { NextApiRequest, NextApiResponse } from 'next'
import type {
  TraderAiStrategistSnapshot,
  TraderMode,
  TraderOpenPosition,
  TraderRiskSnapshot,
  TraderStrategyParamsSnapshot,
  TraderStatusSnapshot,
} from '../../../lib/trader'

type TraderStatusResponse =
  | {
      available: true
      mode: TraderMode
      equityUsd: number | null
      cashUsd: number | null
      openPositions: TraderOpenPosition[]
      openOrdersCount: number
      openOrders: Array<{ id: string | null; product: string | null; side: string | null; qtyBase: number | null; status: string | null }>
      risk: TraderRiskSnapshot
      strategyParams: TraderStrategyParamsSnapshot
      aiStrategist: TraderAiStrategistSnapshot
      products: string[]
      lastRunTs: string | null
      lastError: string | null
      killSwitchEnabled: boolean
      lastUpdated: string
    }
  | {
      available: false
      reason: string
      lastUpdated: string
    }

export type TraderStatusDependencies = {
  getTraderHostAvailability: (options?: { requireState?: boolean; requireTrades?: boolean }) => { available: true } | { available: false; reason: string }
  readTraderStatusSnapshot: () => TraderStatusSnapshot
  now: () => number
}

function nowIso(deps: Pick<TraderStatusDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export async function buildTraderStatusResponse(
  request: Pick<NextApiRequest, 'method'>,
  deps: TraderStatusDependencies,
): Promise<{ statusCode: number; body: TraderStatusResponse }> {
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

  const availability = deps.getTraderHostAvailability({ requireState: true })
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
    const snapshot = deps.readTraderStatusSnapshot()
    return {
      statusCode: 200,
      body: {
        available: true,
        mode: snapshot.mode,
        equityUsd: snapshot.equityUsd,
        cashUsd: snapshot.cashUsd,
        openPositions: snapshot.openPositions,
        openOrdersCount: snapshot.openOrdersCount,
        openOrders: snapshot.openOrders,
        risk: snapshot.risk,
        strategyParams: snapshot.strategyParams,
        aiStrategist: snapshot.aiStrategist,
        products: snapshot.products,
        lastRunTs: snapshot.lastRunTs,
        lastError: snapshot.lastError,
        killSwitchEnabled: snapshot.killSwitchEnabled,
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        available: false,
        reason: 'Failed to load trader status.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TraderStatusDependencies> {
  const { getTraderHostAvailability, readTraderStatusSnapshot } = await import('../../../lib/trader')
  return {
    getTraderHostAvailability,
    readTraderStatusSnapshot,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TraderStatusResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildTraderStatusResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
