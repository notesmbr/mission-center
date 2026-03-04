import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  TRADER_PROJECT_DIR,
  isAllowedTraderPath,
  normalizeTradesLimit,
  parseTradeRow,
  resolveTraderPath,
  tailJsonlRowsFromFile,
} from '../lib/trader.ts'

test('allowlist only accepts fixed trader file paths', () => {
  assert.equal(isAllowedTraderPath(resolveTraderPath('state')), true)
  assert.equal(isAllowedTraderPath(resolveTraderPath('trades')), true)
  assert.equal(isAllowedTraderPath(resolveTraderPath('log')), true)
  assert.equal(isAllowedTraderPath(resolveTraderPath('killSwitch')), true)
  assert.equal(isAllowedTraderPath(resolveTraderPath('db')), true)

  assert.equal(isAllowedTraderPath(path.join(TRADER_PROJECT_DIR, 'notes.txt')), false)
  assert.equal(isAllowedTraderPath(path.join(TRADER_PROJECT_DIR, '..', 'state.json')), false)
  assert.equal(isAllowedTraderPath('/tmp/unrelated.json'), false)
})

test('tailJsonlRowsFromFile returns latest parsed rows in chronological order', () => {
  const tmp = path.join(os.tmpdir(), `mission-center-trades-${Date.now()}.jsonl`)
  const lines: string[] = []

  for (let i = 1; i <= 40; i += 1) {
    lines.push(
      JSON.stringify({
        ts: 1_700_000_000 + i,
        product: i % 2 === 0 ? 'BTC-USD' : 'ETH-USD',
        side: i % 2 === 0 ? 'buy' : 'sell',
        qty: i / 10,
        price: 100 + i,
        fees: 0.01 * i,
        pnlUsd: i - 20,
        reason: `signal-${i}`,
      }),
    )
  }

  // Malformed lines should be skipped without failing the endpoint.
  lines.push('not-json')
  lines.push(JSON.stringify({ ts: 1_800_000_000, side: 'buy' }))

  fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf-8')

  const rows = tailJsonlRowsFromFile(tmp, 5, { initialBytes: 64, maxBytes: 16 * 1024, maxPasses: 8 })
  assert.equal(rows.length, 5)
  assert.equal(rows[0].reason, 'signal-36')
  assert.equal(rows[4].reason, 'signal-40')
  assert.equal(rows[0].product, 'BTC-USD')
  assert.equal(rows[1].product, 'ETH-USD')

  fs.unlinkSync(tmp)
})

test('normalizeTradesLimit enforces default and max bounds', () => {
  assert.equal(normalizeTradesLimit(undefined), 50)
  assert.equal(normalizeTradesLimit('0'), 50)
  assert.equal(normalizeTradesLimit('12'), 12)
  assert.equal(normalizeTradesLimit('999'), 500)
})

test('parseTradeRow redacts reason text and normalizes fields', () => {
  const row = parseTradeRow({
    ts: 1_700_000_000,
    product: 'BTC-USD',
    side: 'BUY',
    qty: '0.2',
    price: '100.12',
    fee: 0.5,
    pnl_usd: -1.25,
    reason: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz12345',
  })

  assert.ok(row)
  assert.equal(row?.side, 'buy')
  assert.equal(row?.qty, 0.2)
  assert.equal(row?.reason?.includes('sk-abcdefghijklmnopqrstuvwxyz12345'), false)
})
