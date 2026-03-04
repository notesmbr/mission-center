import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSwarmHelpersResponse, type SwarmHelpersDependencies } from '../pages/api/swarm/helpers.ts'

function makeDeps(runImpl?: (args: string[]) => Promise<string>): SwarmHelpersDependencies {
  return {
    runOrchestratorCommand: async (args: string[]) => {
      if (runImpl) return runImpl(args)
      return JSON.stringify({ ok: true, args })
    },
    isValidTaskId: (taskId) => /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(taskId),
    getSwarmHostAvailability: () => ({ available: true }),
    now: () => 1_700_000_000_000,
  }
}

test('buildSwarmHelpersResponse supports GET metadata', async () => {
  const result = await buildSwarmHelpersResponse({ method: 'GET', body: {} } as any, makeDeps())
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  if (result.body.available) {
    assert.deepEqual(result.body.supportedCommands, ['route', 'retry'])
  }
})

test('buildSwarmHelpersResponse rejects unsupported command', async () => {
  const result = await buildSwarmHelpersResponse({ method: 'POST', body: { command: 'nudge' } } as any, makeDeps())
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, false)
  if (!result.body.available) {
    assert.equal(result.body.reason.includes('Invalid command'), true)
  }
})

test('buildSwarmHelpersResponse validates route inputs', async () => {
  const result = await buildSwarmHelpersResponse(
    { method: 'POST', body: { command: 'route', projectId: 'bad project', target: 'abc' } } as any,
    makeDeps(),
  )
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, false)
})

test('buildSwarmHelpersResponse executes retry with validated args', async () => {
  let capturedArgs: string[] = []
  const result = await buildSwarmHelpersResponse(
    {
      method: 'POST',
      body: {
        command: 'retry',
        taskId: 'mission-center-make-swarm/ta-823d0a8c',
        status: 'needs_attention',
        limit: 2,
        resetAttempts: true,
      },
    } as any,
    makeDeps(async (args) => {
      capturedArgs = args
      return JSON.stringify({ retried: 1 })
    }),
  )

  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  assert.deepEqual(capturedArgs, [
    'retry',
    '--status',
    'needs_attention',
    '--task-id',
    'mission-center-make-swarm/ta-823d0a8c',
    '--limit',
    '2',
    '--reset-attempts',
  ])
  if (result.body.available) {
    assert.equal((result.body.output as any)?.retried, 1)
  }
})

