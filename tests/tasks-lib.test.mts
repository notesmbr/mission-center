import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import tasksLib from '../lib/tasks.ts'

const {
  CLAW_WORKTREES_DIR,
  matchesProjectFilter,
  normalizeTaskStatus,
  redactSensitiveText,
  readTaskSessionLogTail,
  resolveTaskSessionLogPath,
  sanitizeTask,
  tailLines,
} = tasksLib

test('normalizeTaskStatus maps known and unknown values', () => {
  assert.equal(normalizeTaskStatus('queued'), 'queued')
  assert.equal(normalizeTaskStatus('Needs_Attention'), 'needs_attention')
  assert.equal(normalizeTaskStatus('COMPLETED'), 'unknown')
  assert.equal(normalizeTaskStatus(undefined), 'unknown')
})

test('sanitizeTask returns only safe public fields', () => {
  const safe = sanitizeTask({
    id: 'task-1',
    projectId: 'mission-center',
    agent: 'codex',
    description: 'desc',
    prompt: 'secret prompt',
    repo: '/tmp/private-repo',
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    worktree: '/tmp/wt',
  })

  assert.equal(safe.id, 'task-1')
  assert.equal(safe.status, 'running')
  assert.equal('prompt' in safe, false)
  assert.equal('repo' in safe, false)
})

test('matchesProjectFilter handles all and explicit project', () => {
  assert.equal(matchesProjectFilter('mission-center', 'all'), true)
  assert.equal(matchesProjectFilter('mission-center', 'mission-center'), true)
  assert.equal(matchesProjectFilter('mission-center', 'triplatch-ios'), false)
  assert.equal(matchesProjectFilter(undefined, 'mission-center'), false)
})

test('resolveTaskSessionLogPath only returns whitelisted task path', () => {
  const valid = resolveTaskSessionLogPath({
    id: 'abc123',
    worktree: path.join(CLAW_WORKTREES_DIR, 'abc123'),
  })
  assert.equal(valid, path.join(CLAW_WORKTREES_DIR, 'abc123', '.clawdbot', 'session.log'))

  const nestedId = resolveTaskSessionLogPath({
    id: 'ux/design-polish-accessibili-cee60c46',
    worktree: path.join(CLAW_WORKTREES_DIR, 'ux', 'design-polish-accessibili-cee60c46'),
  })
  assert.equal(nestedId, path.join(CLAW_WORKTREES_DIR, 'ux', 'design-polish-accessibili-cee60c46', '.clawdbot', 'session.log'))

  const invalid = resolveTaskSessionLogPath({
    id: '../escape',
    worktree: '/tmp/not-allowed',
  })
  assert.equal(invalid, null)
})

test('redactSensitiveText masks common secret patterns', () => {
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

test('readTaskSessionLogTail reports unavailable when no file exists', () => {
  const log = readTaskSessionLogTail({
    id: 'definitely-not-a-real-task-id',
    worktree: path.join(CLAW_WORKTREES_DIR, 'definitely-not-a-real-task-id'),
  })
  assert.equal(log.available, false)
  if (!log.available) {
    assert.equal(log.reason, 'no log available')
  }
})
