import test from 'node:test'
import assert from 'node:assert/strict'

import { getProjectSummaries, summarizeTasks, readTextExcerpt } from '../lib/projects'

// Note: these are unit tests for pure helpers; API route is thin.

test('summarizeTasks computes expected buckets', () => {
  const tasks: any[] = [
    { id: 'a', status: 'queued' },
    { id: 'b', status: 'running' },
    { id: 'c', status: 'needs_attention' },
    { id: 'd', status: 'done' },
    { id: 'e', status: 'failed' },
    { id: 'f', status: 'weird' },
  ]

  const s = summarizeTasks(tasks)
  assert.equal(s.total, 6)
  assert.equal(s.queued, 1)
  assert.equal(s.running, 1)
  assert.equal(s.needs_attention, 1)
  assert.equal(s.done, 1)
  assert.equal(s.failed, 1)
  assert.equal(s.unknown, 1)
})

test('getProjectSummaries returns enabled projects sorted by id', () => {
  const projects: any[] = [
    { id: 'b', name: 'B', enabled: true, repo: '/tmp/b' },
    { id: 'a', name: 'A', enabled: true, repo: '/tmp/a' },
    { id: 'c', name: 'C', enabled: false, repo: '/tmp/c' },
  ]

  const tasks: any[] = [
    { id: 't1', projectId: 'a', status: 'done' },
    { id: 't2', projectId: 'b', status: 'running' },
  ]

  const out = getProjectSummaries({ projects, tasks })
  assert.deepEqual(
    out.map((p) => p.id),
    ['a', 'b'],
  )

  assert.equal(out[0].summary.done, 1)
  assert.equal(out[1].summary.running, 1)
})

test('readTextExcerpt extracts title from markdown', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  const tmp = path.join(os.tmpdir(), `mission-center-projects-${Date.now()}.md`)
  fs.writeFileSync(tmp, '# Hello\n\nWorld\n')

  const { title, excerpt } = readTextExcerpt(tmp, 10, 1000)
  assert.equal(title, 'Hello')
  assert.ok(excerpt.includes('World'))

  fs.unlinkSync(tmp)
})
