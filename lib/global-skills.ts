import fs from 'fs'
import path from 'path'

export const GLOBAL_SKILL_SOURCES = ['bundled', 'shared', 'workspace'] as const
export type GlobalSkillSource = (typeof GLOBAL_SKILL_SOURCES)[number]

export const SKILL_SOURCE_PRECEDENCE: Record<GlobalSkillSource, number> = {
  bundled: 1,
  shared: 2,
  workspace: 3,
}

export type GlobalSkillRoots = Record<GlobalSkillSource, string>

export type GlobalSkill = {
  name: string
  description: string
  source: GlobalSkillSource
  path: string
  modifiedAt: string
  overriddenBy: string[]
  overrides: string[]
}

export type InvalidGlobalSkill = {
  name: string
  source: GlobalSkillSource
  path: string
  reason: string
}

export type GlobalSkillsCounts = {
  bundled: number
  shared: number
  workspace: number
  active: number
  total: number
  invalid: number
}

export type GlobalSkillsScanResult = {
  skills: GlobalSkill[]
  invalid: InvalidGlobalSkill[]
  counts: GlobalSkillsCounts
}

type ParsedSkill = Omit<GlobalSkill, 'overriddenBy' | 'overrides'>

function isDirectory(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isDirectory()
  } catch {
    return false
  }
}

function stripWrappingQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim()
  }
  return value
}

function parseSimpleFrontmatter(frontmatterText: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of String(frontmatterText || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)\s*$/)
    if (!match) {
      throw new Error(`invalid frontmatter line: ${rawLine}`)
    }
    const key = match[1]
    const value = stripWrappingQuotes(match[2].trim())
    out[key] = value
  }
  return out
}

export function parseSkillMarkdown(markdown: string): { name: string; description: string } {
  const normalized = String(markdown || '').replace(/^\uFEFF/, '')
  const lines = normalized.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    throw new Error('missing frontmatter block')
  }

  let closingIndex = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closingIndex = i
      break
    }
  }
  if (closingIndex < 0) {
    throw new Error('unterminated frontmatter block')
  }

  const frontmatter = lines.slice(1, closingIndex).join('\n')
  const parsed = parseSimpleFrontmatter(frontmatter)
  const name = String(parsed.name || '').trim()
  const description = String(parsed.description || '').trim()

  if (!name) throw new Error('frontmatter missing "name"')
  if (!description) throw new Error('frontmatter missing "description"')

  return { name, description }
}

function scanSkillSource(rootPath: string, source: GlobalSkillSource): { skills: ParsedSkill[]; invalid: InvalidGlobalSkill[] } {
  const skills: ParsedSkill[] = []
  const invalid: InvalidGlobalSkill[] = []

  if (!rootPath || !isDirectory(rootPath)) {
    return { skills, invalid }
  }

  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true })
  } catch {
    return { skills, invalid }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDirPath = path.join(rootPath, entry.name)
    const skillMdPath = path.join(skillDirPath, 'SKILL.md')

    let hasSkillFile = false
    try {
      hasSkillFile = fs.existsSync(skillMdPath) && fs.statSync(skillMdPath).isFile()
    } catch {
      hasSkillFile = false
    }

    if (!hasSkillFile) {
      invalid.push({
        name: entry.name,
        source,
        path: skillDirPath,
        reason: 'missing SKILL.md',
      })
      continue
    }

    try {
      const rawSkill = fs.readFileSync(skillMdPath, 'utf-8')
      const parsed = parseSkillMarkdown(rawSkill)
      const st = fs.statSync(skillMdPath)
      skills.push({
        name: parsed.name,
        description: parsed.description,
        source,
        path: skillDirPath,
        modifiedAt: st.mtime.toISOString(),
      })
    } catch (error: any) {
      invalid.push({
        name: entry.name,
        source,
        path: skillDirPath,
        reason: `invalid SKILL.md (${error?.message || String(error)})`,
      })
    }
  }

  return { skills, invalid }
}

function sourceRank(source: GlobalSkillSource): number {
  return SKILL_SOURCE_PRECEDENCE[source]
}

export function scanGlobalSkills(roots: GlobalSkillRoots): GlobalSkillsScanResult {
  const collected: ParsedSkill[] = []
  const invalid: InvalidGlobalSkill[] = []

  for (const source of GLOBAL_SKILL_SOURCES) {
    const rootPath = roots[source]
    const scanned = scanSkillSource(rootPath, source)
    collected.push(...scanned.skills)
    invalid.push(...scanned.invalid)
  }

  const byName = new Map<string, ParsedSkill[]>()
  for (const skill of collected) {
    const key = skill.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) existing.push(skill)
    else byName.set(key, [skill])
  }

  const resolved: GlobalSkill[] = []
  for (const group of byName.values()) {
    const sorted = [...group].sort((a, b) => {
      const rankDiff = sourceRank(b.source) - sourceRank(a.source)
      if (rankDiff !== 0) return rankDiff
      return a.path.localeCompare(b.path)
    })

    for (const skill of sorted) {
      const rank = sourceRank(skill.source)
      const overriddenBy = sorted
        .filter((candidate) => sourceRank(candidate.source) > rank)
        .map((candidate) => candidate.path)
      const overrides = sorted
        .filter((candidate) => sourceRank(candidate.source) < rank)
        .map((candidate) => candidate.path)

      resolved.push({
        ...skill,
        overriddenBy,
        overrides,
      })
    }
  }

  resolved.sort((a, b) => {
    const nameDiff = a.name.localeCompare(b.name)
    if (nameDiff !== 0) return nameDiff
    const rankDiff = sourceRank(b.source) - sourceRank(a.source)
    if (rankDiff !== 0) return rankDiff
    return a.path.localeCompare(b.path)
  })

  invalid.sort((a, b) => {
    const sourceDiff = sourceRank(b.source) - sourceRank(a.source)
    if (sourceDiff !== 0) return sourceDiff
    return a.path.localeCompare(b.path)
  })

  const countsBySource: Record<GlobalSkillSource, number> = {
    bundled: 0,
    shared: 0,
    workspace: 0,
  }
  for (const skill of collected) countsBySource[skill.source] += 1

  return {
    skills: resolved,
    invalid,
    counts: {
      bundled: countsBySource.bundled,
      shared: countsBySource.shared,
      workspace: countsBySource.workspace,
      active: byName.size,
      total: collected.length,
      invalid: invalid.length,
    },
  }
}

export default {
  GLOBAL_SKILL_SOURCES,
  SKILL_SOURCE_PRECEDENCE,
  parseSkillMarkdown,
  scanGlobalSkills,
}
