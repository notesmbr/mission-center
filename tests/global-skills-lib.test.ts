import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { parseSkillMarkdown, scanGlobalSkills } from '../lib/global-skills'

function writeSkill(root: string, dirName: string, name: string, description: string) {
  const dir = path.join(root, dirName)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---', '', `# ${name}`, '', 'Body.'].join('\n'),
    'utf-8',
  )
  return dir
}

test('parseSkillMarkdown requires frontmatter name/description', () => {
  const parsed = parseSkillMarkdown(['---', 'name: sample', 'description: sample description', '---', 'body'].join('\n'))
  assert.equal(parsed.name, 'sample')
  assert.equal(parsed.description, 'sample description')

  assert.throws(() => parseSkillMarkdown('# no frontmatter'), /missing frontmatter block/)
  assert.throws(() => parseSkillMarkdown(['---', 'name sample', '---'].join('\n')), /invalid frontmatter line/)
})

test('scanGlobalSkills resolves precedence and reports invalid folders', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-center-skills-'))
  const bundled = path.join(tmpRoot, 'bundled')
  const shared = path.join(tmpRoot, 'shared')
  const workspace = path.join(tmpRoot, 'workspace')

  fs.mkdirSync(bundled, { recursive: true })
  fs.mkdirSync(shared, { recursive: true })
  fs.mkdirSync(workspace, { recursive: true })

  const bundledFoo = writeSkill(bundled, 'foo', 'foo', 'bundled foo')
  const sharedFoo = writeSkill(shared, 'foo', 'foo', 'shared foo')
  writeSkill(shared, 'bar', 'bar', 'shared bar')
  const workspaceFoo = writeSkill(workspace, 'foo', 'foo', 'workspace foo')

  fs.mkdirSync(path.join(shared, 'missing-skill-md'), { recursive: true })
  fs.mkdirSync(path.join(workspace, 'bad-frontmatter'), { recursive: true })
  fs.writeFileSync(path.join(workspace, 'bad-frontmatter', 'SKILL.md'), ['---', 'name broken', '---'].join('\n'), 'utf-8')

  try {
    const result = scanGlobalSkills({
      bundled,
      shared,
      workspace,
    })

    assert.equal(result.counts.bundled, 1)
    assert.equal(result.counts.shared, 2)
    assert.equal(result.counts.workspace, 1)
    assert.equal(result.counts.total, 4)
    assert.equal(result.counts.active, 2)
    assert.equal(result.counts.invalid, 2)

    const fooSkills = result.skills.filter((skill) => skill.name === 'foo')
    assert.equal(fooSkills.length, 3)

    const workspaceFooSkill = fooSkills.find((skill) => skill.source === 'workspace')
    const sharedFooSkill = fooSkills.find((skill) => skill.source === 'shared')
    const bundledFooSkill = fooSkills.find((skill) => skill.source === 'bundled')

    assert.ok(workspaceFooSkill)
    assert.ok(sharedFooSkill)
    assert.ok(bundledFooSkill)

    assert.deepEqual(workspaceFooSkill?.overriddenBy || [], [])
    assert.deepEqual((workspaceFooSkill?.overrides || []).sort(), [bundledFoo, sharedFoo].sort())

    assert.deepEqual(sharedFooSkill?.overriddenBy || [], [workspaceFoo])
    assert.deepEqual(sharedFooSkill?.overrides || [], [bundledFoo])

    assert.deepEqual((bundledFooSkill?.overriddenBy || []).sort(), [workspaceFoo, sharedFoo].sort())
    assert.deepEqual(bundledFooSkill?.overrides || [], [])

    assert.equal(result.skills.every((skill) => Number.isFinite(Date.parse(skill.modifiedAt))), true)

    const invalidReasons = result.invalid.map((item) => item.reason).join('\n')
    assert.equal(invalidReasons.includes('missing SKILL.md'), true)
    assert.equal(invalidReasons.includes('invalid SKILL.md'), true)
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})
