import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStatusResponse, type StatusDependencies } from '../pages/api/status.ts'
import { buildCronListResponse, type CronListDependencies } from '../pages/api/cron/list.ts'
import { buildCronRunsResponse, type CronRunsDependencies } from '../pages/api/cron/runs.ts'

const FIXED_NOW = 1_700_000_000_000

test('buildStatusResponse enforces GET and returns stable success shape', async () => {
  const deps: StatusDependencies = {
    runOpenClawCommand: async () =>
      JSON.stringify({
        gateway: { bind: '127.0.0.1:7777' },
        tailscale: { state: 'running' },
        heartbeat: { agents: [{ every: '30s' }] },
        sessions: {
          count: 1,
          defaults: { model: 'gpt-5' },
          recent: [
            {
              agentId: 'codex',
              key: 'session-1',
              kind: 'worktree',
              age: 1234,
              model: 'gpt-5',
              percentUsed: 25,
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
            },
          ],
        },
      }),
    now: () => FIXED_NOW,
  }

  const badMethod = await buildStatusResponse({ method: 'POST' } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const ok = await buildStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.available, true)
  if (ok.body.available) {
    assert.equal(ok.body.dataSource, 'openclaw_status_json')
    assert.equal(ok.body.openclaw.reachable, true)
    assert.equal(ok.body.openclaw.defaultModel, 'gpt-5')
    assert.equal(ok.body.sessions.length, 1)
    assert.equal(ok.body.sessions[0]?.agentId, 'codex')
    assert.equal(ok.body.lastUpdated, new Date(FIXED_NOW).toISOString())
  }
})

test('buildStatusResponse returns unavailable shape on command failure', async () => {
  const deps: StatusDependencies = {
    runOpenClawCommand: async () => {
      throw new Error('openclaw missing')
    },
    now: () => FIXED_NOW,
  }

  const result = await buildStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, false)
  if (!result.body.available) {
    assert.equal(result.body.dataSource, 'openclaw_status_json')
    assert.equal(result.body.reason.includes('Failed to run openclaw status --json'), true)
  }
})

test('buildCronListResponse enforces GET and returns jobs payload shape', async () => {
  const deps: CronListDependencies = {
    runOpenClawCommand: async () =>
      JSON.stringify({
        jobs: [{ id: 'job-1', name: 'Nightly', enabled: true }],
      }),
    now: () => FIXED_NOW,
  }

  const badMethod = await buildCronListResponse({ method: 'POST' } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const ok = await buildCronListResponse({ method: 'GET' } as any, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.available, true)
  if (ok.body.available) {
    assert.equal(ok.body.dataSource, 'openclaw_cron_list')
    assert.equal(Array.isArray(ok.body.jobs), true)
    assert.equal(ok.body.jobs.length, 1)
  }
})

test('buildCronRunsResponse validates method/id and returns entries payload shape', async () => {
  const deps: CronRunsDependencies = {
    runOpenClawCommand: async (_args) =>
      JSON.stringify({
        entries: [{ runId: 'run-1', status: 'ok' }],
      }),
    now: () => FIXED_NOW,
  }

  const badMethod = await buildCronRunsResponse({ method: 'POST', query: {} } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const missingId = await buildCronRunsResponse({ method: 'GET', query: {} } as any, deps)
  assert.equal(missingId.statusCode, 200)
  assert.equal(missingId.body.available, false)
  if (!missingId.body.available) {
    assert.equal(missingId.body.reason, 'Missing cron job id (use ?id=...)')
  }

  const ok = await buildCronRunsResponse({ method: 'GET', query: { id: ['job-1', 'job-2'] } } as any, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.available, true)
  if (ok.body.available) {
    assert.equal(ok.body.dataSource, 'openclaw_cron_runs')
    assert.equal(Array.isArray(ok.body.entries), true)
    assert.equal(ok.body.entries.length, 1)
  }
})
