import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeTask, sanitizeTasks } from '../lib/swarm.ts'
import { buildSwarmStatusResponse, type SwarmStatusDependencies } from '../pages/api/swarm/status.ts'
import { buildSwarmTaskDetailsResponse, type SwarmTaskDetailsDependencies } from '../pages/api/swarm/task-details.ts'

test('buildSwarmStatusResponse rejects non-GET requests', async () => {
  const deps: SwarmStatusDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    readClawdbotConfig: () => ({ projects: [] }),
    sanitizeTasks,
    getSwarmHostAvailability: () => ({ available: true }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildSwarmStatusResponse({ method: 'POST' } as any, deps)
  assert.equal(result.statusCode, 405)
  assert.equal(result.body.available, false)
})

test('buildSwarmStatusResponse returns local-host unavailable reason when paths are missing', async () => {
  const deps: SwarmStatusDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    readClawdbotConfig: () => ({ projects: [] }),
    sanitizeTasks,
    getSwarmHostAvailability: () => ({
      available: false,
      reason: 'Swarm status is only available when Mission Center runs on the OpenClaw host.',
    }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildSwarmStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, false)
  if (!result.body.available) {
    assert.equal(result.body.reason.includes('OpenClaw host'), true)
  }
})

test('buildSwarmStatusResponse returns summary/grouping/filter metadata', async () => {
  const deps: SwarmStatusDependencies = {
    readActiveTasks: () => ({
      tasks: [
        { id: 'task-a', projectId: 'mission-center', agent: 'codex', status: 'queued' },
        { id: 'task-b', projectId: 'mission-center', agent: 'claude', status: 'running' },
        { id: 'task-c', projectId: 'triplatch-ios', agent: 'codex', status: 'needs_attention' },
      ],
    }),
    readClawdbotConfig: () => ({
      projects: [
        { id: 'mission-center', name: 'Mission Center', enabled: true },
        { id: 'triplatch-ios', name: 'TripLatch', enabled: true },
      ],
      doneCriteria: {
        progressOnCiGreen: true,
      },
      notifications: {
        readyForReview: {
          enabled: true,
          channel: 'discord',
          targets: {
            'mission-center': '111',
          },
        },
      },
    }),
    sanitizeTasks,
    getSwarmHostAvailability: () => ({ available: true }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildSwarmStatusResponse({ method: 'GET' } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  if (result.body.available) {
    assert.equal(result.body.summary.total, 3)
    assert.equal(result.body.summary.queued, 1)
    assert.equal(result.body.summary.running, 1)
    assert.equal(result.body.summary.needs_attention, 1)
    assert.equal(result.body.groupedTasks.length, 2)
    assert.equal(result.body.projectSummaries.length, 2)
    assert.equal(result.body.orchestrator.doneCriteria.progressOnCiGreen, true)
    assert.equal(result.body.orchestrator.helperCommands.route.includes('[--channel <channel>]'), true)
    assert.equal(result.body.orchestrator.helperCommands.retry.includes('[--limit <n>]'), true)
    assert.equal(result.body.orchestrator.helperCommands.retry.includes('[--reset-attempts]'), true)
    assert.equal(result.body.notificationRoutes[0]?.projectId, 'mission-center')
    assert.equal(result.body.filters.projectIds.includes('mission-center'), true)
    assert.equal(result.body.filters.agents.includes('codex'), true)
  }
})

test('buildSwarmTaskDetailsResponse validates method and id', async () => {
  const deps: SwarmTaskDetailsDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    sanitizeTask,
    readTaskSessionLogTail: () => ({ available: false, reason: 'no log available' }),
    isValidTaskId: (taskId) => taskId === 'task-1',
    getSwarmHostAvailability: () => ({ available: true }),
    now: () => 1_700_000_000_000,
  }

  const invalidMethod = await buildSwarmTaskDetailsResponse({ method: 'PUT', query: {} } as any, deps)
  assert.equal(invalidMethod.statusCode, 405)

  const invalidId = await buildSwarmTaskDetailsResponse({ method: 'GET', query: { id: '../escape' } } as any, deps)
  assert.equal(invalidId.statusCode, 200)
  assert.equal(invalidId.body.available, false)
  if (!invalidId.body.available) {
    assert.equal(invalidId.body.reason, 'Invalid task id format.')
  }
})

test('buildSwarmTaskDetailsResponse returns task + tmux attach command + log tail', async () => {
  const deps: SwarmTaskDetailsDependencies = {
    readActiveTasks: () => ({
      tasks: [
        {
          id: 'task-1',
          projectId: 'mission-center',
          status: 'running',
          tmuxSession: 'code-task-1',
          note: 'done',
          prompt: 'private',
        } as any,
      ],
    }),
    sanitizeTask,
    readTaskSessionLogTail: () => ({ available: true, path: '.clawdbot/.claw-worktrees/task-1/.clawdbot/session.log', tail: 'line1', lineCount: 1 }),
    isValidTaskId: (taskId) => taskId === 'task-1',
    getSwarmHostAvailability: () => ({ available: true }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildSwarmTaskDetailsResponse({ method: 'GET', query: { id: ['task-1', 'task-2'] } } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  if (result.body.available) {
    assert.equal(result.body.task.id, 'task-1')
    assert.equal(result.body.tmuxAttachCommand, 'tmux attach -t code-task-1')
    assert.equal(result.body.helperCommands.retryTask.includes('[--reset-attempts]'), true)
    assert.equal(result.body.helperCommands.routeProjectNotifications.includes('[--channel <channel>]'), true)
    assert.equal(result.body.log.available, true)
    assert.equal('prompt' in result.body.task, false)
  }
})
