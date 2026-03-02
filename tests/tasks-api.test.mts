import assert from 'node:assert/strict'
import test from 'node:test'

import tasksLib from '../lib/tasks.ts'
import listApi from '../pages/api/tasks/list.ts'
import detailsApi from '../pages/api/tasks/details.ts'

import type { TaskDetailsDependencies } from '../pages/api/tasks/details.ts'
import type { TasksListDependencies } from '../pages/api/tasks/list.ts'

const { matchesProjectFilter, sanitizeTask, sanitizeTasks } = tasksLib
const { __resetTasksSyncThrottleForTests, buildTasksListResponse } = listApi
const { buildTaskDetailsResponse, isValidTaskId } = detailsApi

test('buildTasksListResponse rejects non-GET requests', async () => {
  const deps: TasksListDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    readClawdbotConfig: () => ({ projects: [] }),
    runOrchestratorCommand: async () => '',
    sanitizeTasks,
    matchesProjectFilter,
    now: () => 1_700_000_000_000,
  }

  const result = await buildTasksListResponse({ method: 'POST', query: {} } as any, deps)
  assert.equal(result.statusCode, 405)
  assert.equal(result.body.available, false)
  if (!result.body.available) {
    assert.equal(result.body.reason, 'Method not allowed. Use GET.')
  }
})

test('buildTasksListResponse filters by selected project and sanitizes invalid project query', async () => {
  __resetTasksSyncThrottleForTests()
  const deps: TasksListDependencies = {
    readActiveTasks: () => ({
      tasks: [
        { id: 'task-a', projectId: 'mission-center', status: 'queued' },
        { id: 'task-b', projectId: 'triplatch-ios', status: 'running' },
      ],
    }),
    readClawdbotConfig: () => ({
      projects: [
        { id: 'mission-center', name: 'Mission Center', enabled: true },
        { id: 'triplatch-ios', name: 'TripLatch', enabled: false },
        { id: '' },
      ],
    }),
    runOrchestratorCommand: async () => '',
    sanitizeTasks,
    matchesProjectFilter,
    now: () => 1_700_000_000_000,
  }

  const filtered = await buildTasksListResponse({ method: 'GET', query: { project: 'mission-center' } } as any, deps)
  assert.equal(filtered.statusCode, 200)
  assert.equal(filtered.body.available, true)
  if (filtered.body.available) {
    assert.equal(filtered.body.tasks.length, 1)
    assert.equal(filtered.body.tasks[0]?.id, 'task-a')
    assert.equal(filtered.body.projects.length, 2)
  }

  const invalidProject = await buildTasksListResponse({ method: 'GET', query: { project: '../../escape' } } as any, deps)
  assert.equal(invalidProject.body.available, true)
  if (invalidProject.body.available) {
    assert.equal(invalidProject.body.tasks.length, 2)
  }
})

test('buildTasksListResponse includes project IDs discovered from tasks', async () => {
  __resetTasksSyncThrottleForTests()
  const deps: TasksListDependencies = {
    readActiveTasks: () => ({
      tasks: [
        { id: 'task-a', projectId: 'mission-center', status: 'queued' },
        { id: 'task-b', projectId: 'floating-project', status: 'running' },
      ],
    }),
    readClawdbotConfig: () => ({
      projects: [{ id: 'mission-center', name: 'Mission Center', enabled: true }],
    }),
    runOrchestratorCommand: async () => '',
    sanitizeTasks,
    matchesProjectFilter,
    now: () => 1_700_000_000_000,
  }

  const filtered = await buildTasksListResponse({ method: 'GET', query: { project: 'mission-center' } } as any, deps)
  assert.equal(filtered.statusCode, 200)
  assert.equal(filtered.body.available, true)
  if (filtered.body.available) {
    const projectIds = filtered.body.projects.map((project) => project.id).sort()
    assert.deepEqual(projectIds, ['floating-project', 'mission-center'])
    assert.equal(filtered.body.tasks.length, 1)
    assert.equal(filtered.body.tasks[0]?.projectId, 'mission-center')
  }
})

test('buildTasksListResponse throttles orchestrator sync attempts', async () => {
  __resetTasksSyncThrottleForTests()
  let nowMs = 1_700_000_000_000
  let runCount = 0
  const deps: TasksListDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    readClawdbotConfig: () => ({ projects: [] }),
    runOrchestratorCommand: async () => {
      runCount += 1
      return ''
    },
    sanitizeTasks,
    matchesProjectFilter,
    now: () => nowMs,
  }

  const first = await buildTasksListResponse({ method: 'GET', query: { sync: '1' } } as any, deps)
  assert.equal(first.body.available, true)
  if (first.body.available) {
    assert.equal(first.body.syncAttempted, true)
    assert.equal(first.body.syncThrottled, false)
  }
  assert.equal(runCount, 1)

  nowMs += 30_000
  const second = await buildTasksListResponse({ method: 'GET', query: { sync: '1' } } as any, deps)
  assert.equal(second.body.available, true)
  if (second.body.available) {
    assert.equal(second.body.syncAttempted, false)
    assert.equal(second.body.syncThrottled, true)
  }
  assert.equal(runCount, 1)
})

test('isValidTaskId accepts slash-delimited IDs and rejects traversal', () => {
  assert.equal(isValidTaskId('ux/design-polish-accessibili-cee60c46'), true)
  assert.equal(isValidTaskId('../escape'), false)
  assert.equal(isValidTaskId(''), false)
})

test('buildTaskDetailsResponse validates method and id format', async () => {
  const deps: TaskDetailsDependencies = {
    readActiveTasks: () => ({ tasks: [] }),
    sanitizeTask,
    readTaskSessionLogTail: () => ({ available: false, reason: 'no log available' }),
    now: () => 1_700_000_000_000,
  }

  const badMethod = await buildTaskDetailsResponse({ method: 'PUT', query: {} } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const invalidId = await buildTaskDetailsResponse({ method: 'GET', query: { id: '../escape' } } as any, deps)
  assert.equal(invalidId.statusCode, 200)
  assert.equal(invalidId.body.available, false)
  if (!invalidId.body.available) {
    assert.equal(invalidId.body.reason, 'Invalid task id format.')
  }
})

test('buildTaskDetailsResponse returns sanitized task details', async () => {
  const deps: TaskDetailsDependencies = {
    readActiveTasks: () => ({
      tasks: [
        {
          id: 'task-1',
          projectId: 'mission-center',
          status: 'running',
          prompt: 'secret prompt',
          repo: '/tmp/private',
          worktree: '/tmp/worktree',
        } as any,
      ],
    }),
    sanitizeTask,
    readTaskSessionLogTail: () => ({ available: false, reason: 'no log available' }),
    now: () => 1_700_000_000_000,
  }

  const result = await buildTaskDetailsResponse({ method: 'GET', query: { id: ['task-1', 'task-2'] } } as any, deps)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.available, true)
  if (result.body.available) {
    assert.equal(result.body.task.id, 'task-1')
    assert.equal('prompt' in result.body.task, false)
    assert.equal('repo' in result.body.task, false)
    assert.equal(result.body.log.available, false)
  }
})
