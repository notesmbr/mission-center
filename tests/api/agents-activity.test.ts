import assert from 'node:assert/strict'
import test from 'node:test'

import {
  makeAgentsListFailure,
  makeAgentsListSuccess,
  sanitizeRecentSessions,
} from '../../pages/api/_lib/agents'
import {
  OPENCLAW_ACTIVITY_LOGS,
  isAllowedActivityLogPath,
  redactTokenLikeStrings,
  tailLines,
} from '../../pages/api/_lib/activity'

test('sanitizeRecentSessions returns stable, sanitized shape', () => {
  const nowMs = Date.parse('2026-03-02T15:00:00.000Z')

  const sessions = sanitizeRecentSessions(
    [
      {
        agentId: 'agent-a',
        key: 'session-alpha',
        kind: 'worktree',
        sessionId: 's-1',
        updatedAt: '2026-03-02T14:59:00.000Z',
        age: 60_000,
        model: 'gpt-5',
        percentUsed: 40,
        totalTokens: 1200,
        remainingTokens: 1800,
        abortedLastRun: true,
        flags: ['focus'],
        secret: 'do-not-leak',
      },
      {
        agentId: 'agent-a',
        key: 'session-older',
        kind: 'worktree',
        age: 600_000,
      },
    ],
    nowMs
  )

  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].key, 'session-alpha')

  const keys = Object.keys(sessions[0]).sort()
  assert.deepEqual(keys, [
    'abortedLastRun',
    'age',
    'agentId',
    'flags',
    'key',
    'kind',
    'model',
    'percentUsed',
    'remainingTokens',
    'sessionId',
    'totalTokens',
    'updatedAt',
  ])

  assert.ok(!('secret' in sessions[0]))
})

test('agents response builders return expected shapes', () => {
  const now = new Date('2026-03-02T15:00:00.000Z')
  const success = makeAgentsListSuccess([], now)
  const failure = makeAgentsListFailure('boom', now)

  assert.equal(success.dataSource, 'openclaw_status_recent')
  assert.equal(success.available, true)
  assert.equal(success.lastUpdated, now.toISOString())

  assert.equal(failure.dataSource, 'openclaw_status_recent')
  assert.equal(failure.available, false)
  if (!failure.available) {
    assert.equal(failure.reason, 'boom')
  }
})

test('activity path whitelist only allows explicit gateway logs', () => {
  assert.equal(isAllowedActivityLogPath(OPENCLAW_ACTIVITY_LOGS.gateway), true)
  assert.equal(isAllowedActivityLogPath(OPENCLAW_ACTIVITY_LOGS.gatewayErr), true)
  assert.equal(isAllowedActivityLogPath('/tmp/evil.log'), false)
})

test('redaction removes token-like secrets from logs', () => {
  const raw = [
    'authorization=Bearer abcdefghijklmnopqrstuvwxyz123456',
    'token: sk-prod-A1b2C3d4E5f6G7h8I9j0',
    'opaque C8m6Dx1rY8q2vQ4nL7p5sT9uB3w1kJ6m',
  ].join('\n')

  const redacted = redactTokenLikeStrings(raw)

  assert.match(redacted, /authorization=\[REDACTED\]/i)
  assert.match(redacted, /token:\[REDACTED\]/i)
  assert.match(redacted, /\[REDACTED_TOKEN\]/)
  assert.doesNotMatch(redacted, /sk-prod-A1b2C3d4E5f6G7h8I9j0/)
})

test('tailLines returns the expected trailing lines', () => {
  const text = 'a\n\nb\nc\n'
  const out = tailLines(text, 2)
  assert.equal(out.lineCount, 3)
  assert.equal(out.tail, 'b\nc')
})
