import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGlobalSkillsResponse, type GlobalSkillsDependencies } from '../pages/api/skills/global.ts'

const FIXED_NOW = 1_700_000_000_000

test('buildGlobalSkillsResponse enforces GET and returns normalized payload', async () => {
  const deps: GlobalSkillsDependencies = {
    getRoots: () => ({
      bundled: '/tmp/bundled-skills',
      shared: '/tmp/shared-skills',
      workspace: '/tmp/workspace-skills',
    }),
    scanGlobalSkills: () => ({
      skills: [
        {
          name: 'foo',
          description: 'workspace foo',
          source: 'workspace',
          path: '/tmp/workspace-skills/foo',
          modifiedAt: '2026-03-08T00:00:00.000Z',
          overriddenBy: [],
          overrides: ['/tmp/shared-skills/foo', '/tmp/bundled-skills/foo'],
        },
      ],
      invalid: [
        {
          name: 'broken',
          source: 'shared',
          path: '/tmp/shared-skills/broken',
          reason: 'missing SKILL.md',
        },
      ],
      counts: {
        bundled: 1,
        shared: 1,
        workspace: 1,
        active: 1,
        total: 3,
        invalid: 1,
      },
    }),
    now: () => FIXED_NOW,
  }

  const badMethod = await buildGlobalSkillsResponse({ method: 'POST' } as any, deps)
  assert.equal(badMethod.statusCode, 405)
  assert.equal(badMethod.body.available, false)

  const ok = await buildGlobalSkillsResponse({ method: 'GET' } as any, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.available, true)
  if (ok.body.available) {
    assert.equal(ok.body.dataSource, 'openclaw_global_skills')
    assert.deepEqual(ok.body.precedence, ['workspace', 'shared', 'bundled'])
    assert.equal(ok.body.skills.length, 1)
    assert.equal(ok.body.invalid.length, 1)
    assert.equal(ok.body.counts.active, 1)
    assert.equal(ok.body.lastUpdated, new Date(FIXED_NOW).toISOString())
  }
})
