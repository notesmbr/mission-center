import assert from 'node:assert/strict'
import test from 'node:test'

import reconciliationLib, { shouldConsiderTask } from '../pages/api/_lib/pr-reconciliation'

const { reconcileTaskWithLivePr } = reconciliationLib as {
  reconcileTaskWithLivePr: (task: any, snapshot: any, nowMs: number) => any
}

test('reconcileTaskWithLivePr marks merged PRs done and replaces stale ready note', () => {
  const nowMs = 1_700_000_123_000
  const task = {
    id: 'task-1',
    status: 'done',
    note: 'All done-gate checks passed. Ready to merge.',
    pr: {
      number: 42,
      state: 'OPEN',
      url: 'https://example.test/pr/42',
    },
  }
  const snapshot = {
    number: 42,
    state: 'MERGED',
    url: 'https://example.test/pr/42',
    title: 'Fix reconciliation',
  }

  const out = reconcileTaskWithLivePr(task, snapshot, nowMs)
  assert.equal(out.status, 'done')
  assert.equal(out.pr?.state, 'MERGED')
  assert.equal(out.note, 'Merged: https://example.test/pr/42')
  assert.equal(out.updatedAt, nowMs)
  assert.equal(out.completedAt, nowMs)
})

test('reconcileTaskWithLivePr replaces stale ready note when PR is closed', () => {
  const nowMs = 1_700_000_123_000
  const task = {
    id: 'task-2',
    status: 'needs_attention',
    note: 'CI green; ready for human review (not merged). Pending: screenshot',
    pr: {
      number: 77,
      state: 'OPEN',
      url: 'https://example.test/pr/77',
    },
  }
  const snapshot = {
    number: 77,
    state: 'CLOSED',
    url: 'https://example.test/pr/77',
  }

  const out = reconcileTaskWithLivePr(task, snapshot, nowMs)
  assert.equal(out.pr?.state, 'CLOSED')
  assert.equal(out.note, 'PR closed (not merged): https://example.test/pr/77')
  assert.equal(out.updatedAt, nowMs)
})

test('shouldConsiderTask honors taskIds selection filter strictly', () => {
  const selected = new Set(['task-2'])
  assert.equal(
    shouldConsiderTask(
      {
        id: 'task-1',
        status: 'done',
        note: 'All done-gate checks passed. Ready to merge.',
        pr: { number: 10, state: 'OPEN' },
      },
      selected,
    ),
    false,
  )
  assert.equal(
    shouldConsiderTask(
      {
        id: 'task-2',
        status: 'queued',
        pr: { number: 11, state: 'OPEN' },
      },
      selected,
    ),
    true,
  )
})
