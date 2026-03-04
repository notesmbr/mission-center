import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTraderStatusResponse, type TraderStatusDependencies } from '../pages/api/trader/status.ts'
import { buildTraderTradesResponse, type TraderTradesDependencies } from '../pages/api/trader/trades.ts'
import { buildTraderKillSwitchResponse, type TraderKillSwitchDependencies } from '../pages/api/trader/kill-switch.ts'

test('buildTraderStatusResponse validates method and host availability', async () => {
  const deps: TraderStatusDependencies = {
    getTraderHostAvailability: () => ({ available: false, reason: 'Trader view is only available on the OpenClaw host.' }),
    readTraderStatusSnapshot: () => {
      throw new Error('should not be called')
    },
    now: () => 1_700_000_000_000,
  }

  const badMethod = await buildTraderStatusResponse({ method: 'POST' } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const unavailable = await buildTraderStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(unavailable.statusCode, 200)
  assert.equal(unavailable.body.available, false)
  if (!unavailable.body.available) {
    assert.equal(unavailable.body.reason.includes('OpenClaw host'), true)
  }
})

test('buildTraderStatusResponse returns stable status payload shape', async () => {
  const deps: TraderStatusDependencies = {
    getTraderHostAvailability: () => ({ available: true }),
    readTraderStatusSnapshot: () => ({
      mode: 'paper',
      equityUsd: 123.45,
      cashUsd: 100.0,
      openPositions: [{ product: 'BTC-USD', qty: 0.2, entryPrice: 90, markPrice: 100, unrealizedPnlUsd: 2 }],
      openOrdersCount: 1,
      products: ['BTC-USD'],
      lastRunTs: '2026-03-04T17:00:00.000Z',
      lastError: null,
      killSwitchEnabled: false,
    }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildTraderStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  if (result.body.available) {
    assert.equal(result.body.mode, 'paper')
    assert.equal(result.body.equityUsd, 123.45)
    assert.equal(result.body.openPositions.length, 1)
    assert.equal(result.body.killSwitchEnabled, false)
    assert.equal(typeof result.body.lastUpdated, 'string')
  }
})

test('buildTraderTradesResponse normalizes limit and returns rows', async () => {
  let requestedLimit = -1

  const deps: TraderTradesDependencies = {
    getTraderHostAvailability: () => ({ available: true }),
    normalizeTradesLimit: (_raw) => 75,
    readTraderTrades: (limit) => {
      requestedLimit = limit
      return [{ ts: '2026-03-04T17:00:00.000Z', product: 'ETH-USD', side: 'buy', qty: 1, price: 2_000, fees: 1, pnlUsd: 3, reason: null }]
    },
    now: () => 1_700_000_000_000,
  }

  const result = await buildTraderTradesResponse({ method: 'GET', query: { limit: '9999' } } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  assert.equal(requestedLimit, 75)
  if (result.body.available) {
    assert.equal(result.body.rows.length, 1)
    assert.equal(result.body.rows[0]?.product, 'ETH-USD')
  }
})

test('buildTraderTradesResponse rejects non-GET and unavailable host', async () => {
  const deps: TraderTradesDependencies = {
    getTraderHostAvailability: () => ({ available: false, reason: 'Trader view is only available on the OpenClaw host.' }),
    normalizeTradesLimit: () => 50,
    readTraderTrades: () => [],
    now: () => 1_700_000_000_000,
  }

  const badMethod = await buildTraderTradesResponse({ method: 'POST', query: {} } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const unavailable = await buildTraderTradesResponse({ method: 'GET', query: {} } as any, deps)
  assert.equal(unavailable.statusCode, 200)
  assert.equal(unavailable.body.available, false)
})

test('buildTraderKillSwitchResponse validates method/body and updates state', async () => {
  let latestEnabled: boolean | null = null

  const deps: TraderKillSwitchDependencies = {
    getTraderHostAvailability: () => ({ available: true }),
    setKillSwitchEnabled: (enabled) => {
      latestEnabled = enabled
      return enabled
    },
    now: () => 1_700_000_000_000,
  }

  const badMethod = await buildTraderKillSwitchResponse({ method: 'GET', body: {} } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const badBody = await buildTraderKillSwitchResponse({ method: 'POST', body: { enabled: 'true' } } as any, deps)
  assert.equal(badBody.statusCode, 400)
  assert.equal(badBody.body.available, false)

  const ok = await buildTraderKillSwitchResponse({ method: 'POST', body: { enabled: true } } as any, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.available, true)
  assert.equal(latestEnabled, true)
  if (ok.body.available) {
    assert.equal(ok.body.killSwitchEnabled, true)
  }
})

test('buildTraderKillSwitchResponse returns unavailable when host files are missing', async () => {
  const deps: TraderKillSwitchDependencies = {
    getTraderHostAvailability: () => ({ available: false, reason: 'Trader view is only available on the OpenClaw host.' }),
    setKillSwitchEnabled: () => {
      throw new Error('should not be called')
    },
    now: () => 1_700_000_000_000,
  }

  const result = await buildTraderKillSwitchResponse({ method: 'POST', body: { enabled: false } } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, false)
})
