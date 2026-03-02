import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  CLAW_WORKTREES_DIR,
  normalizeTaskStatus,
  redactSensitiveText,
  readTaskSessionLogTail,
  resolveTaskSessionLogPath,
  sanitizeTask,
  tailLines,
} from '../lib/swarm.ts'

test('normalizeTaskStatus handles known and unknown values', () => {
  assert.equal(normalizeTaskStatus('queued'), 'queued')
  assert.equal(normalizeTaskStatus('Needs_Attention'), 'needs_attention')
  assert.equal(normalizeTaskStatus('COMPLETED'), 'unknown')
  assert.equal(normalizeTaskStatus(undefined), 'unknown')
})

test('sanitizeTask returns only public fields and normalized status', () => {
  const safeTask = sanitizeTask({
    id: 'task-1',
    projectId: 'mission-center',
    description: 'test task',
    status: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    note: 'OPENAI_API_KEY=sk-1234567890abcdef',
    // extra internal fields should never be exposed
    prompt: 'secret prompt',
    repo: '/private/repo',
  } as any)

  assert.equal(safeTask.id, 'task-1')
  assert.equal(safeTask.status, 'running')
  assert.equal('prompt' in safeTask, false)
  assert.equal('repo' in safeTask, false)
  assert.equal(safeTask.note?.includes('sk-1234567890abcdef'), false)
})

test('resolveTaskSessionLogPath only returns whitelisted session.log paths', () => {
  const valid = resolveTaskSessionLogPath({
    id: 'abc123',
    worktree: path.join(CLAW_WORKTREES_DIR, 'abc123'),
  })
  assert.equal(valid, path.join(CLAW_WORKTREES_DIR, 'abc123', '.clawdbot', 'session.log'))

  const nested = resolveTaskSessionLogPath({
    id: 'ux/design-polish-accessibili-cee60c46',
    worktree: path.join(CLAW_WORKTREES_DIR, 'ux', 'design-polish-accessibili-cee60c46'),
  })
  assert.equal(nested, path.join(CLAW_WORKTREES_DIR, 'ux', 'design-polish-accessibili-cee60c46', '.clawdbot', 'session.log'))

  const traversal = resolveTaskSessionLogPath({
    id: '../escape',
    worktree: '/tmp/not-allowed',
  })
  assert.equal(traversal, null)

  const mismatched = resolveTaskSessionLogPath({
    id: 'abc123',
    worktree: path.join(CLAW_WORKTREES_DIR, 'different'),
  })
  assert.equal(mismatched, null)
})

test('redactSensitiveText masks common token-like patterns', () => {
  const input = [
    'OPENAI_API_KEY=sk-1234567890abcdef',
    'Authorization: Bearer abcdefghijklmnopqrstuv',
    'github_pat_abcdefghijklmnopqrstuvxyz0123456789',
  ].join('\n')
  const redacted = redactSensitiveText(input)

  assert.equal(redacted.includes('sk-1234567890abcdef'), false)
  assert.equal(redacted.includes('abcdefghijklmnopqrstuv'), false)
  assert.equal(redacted.includes('github_pat_abcdefghijklmnopqrstuvxyz0123456789'), false)
  assert.equal(redacted.includes('[REDACTED]') || redacted.includes('[REDACTED_TOKEN]'), true)
})

test('tailLines keeps recent non-empty lines', () => {
  const { tail, lineCount } = tailLines('a\n\nb\nc\n', 2)
  assert.equal(lineCount, 3)
  assert.equal(tail, 'b\nc')
})

test('readTaskSessionLogTail is unavailable when no session log exists', () => {
  const result = readTaskSessionLogTail({
    id: 'definitely-not-a-real-task-id',
    worktree: path.join(CLAW_WORKTREES_DIR, 'definitely-not-a-real-task-id'),
  })
  assert.equal(result.available, false)
  if (!result.available) {
    assert.equal(result.reason, 'no log available')
  }
})
