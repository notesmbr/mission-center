import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'

import { OPENCLAW_DIR, WORKSPACE_ROOT } from '../_lib/paths'
import type { GlobalSkill, GlobalSkillRoots, InvalidGlobalSkill, GlobalSkillsCounts } from '../../../lib/global-skills'

type GlobalSkillsResponse =
  | {
      dataSource: 'openclaw_global_skills'
      available: true
      roots: GlobalSkillRoots
      precedence: Array<'workspace' | 'shared' | 'bundled'>
      skills: GlobalSkill[]
      invalid: InvalidGlobalSkill[]
      counts: GlobalSkillsCounts
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_global_skills'
      available: false
      reason: string
      lastUpdated: string
    }

export type GlobalSkillsDependencies = {
  scanGlobalSkills: (roots: GlobalSkillRoots) => { skills: GlobalSkill[]; invalid: InvalidGlobalSkill[]; counts: GlobalSkillsCounts }
  getRoots: () => GlobalSkillRoots
  now: () => number
}

function nowIso(deps: Pick<GlobalSkillsDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function isExistingDirectory(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isDirectory()
  } catch {
    return false
  }
}

function getBundledSkillsCandidates(
  nodeExecPath: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const pathImpl = platform === 'win32' ? path.win32 : path.posix
  const fromExecPath = pathImpl.resolve(pathImpl.dirname(nodeExecPath), '..', 'lib', 'node_modules', 'openclaw', 'skills')
  const unixCandidates = [
    '/usr/local/lib/node_modules/openclaw/skills',
    '/usr/lib/node_modules/openclaw/skills',
    '/opt/homebrew/lib/node_modules/openclaw/skills',
    '/opt/local/lib/node_modules/openclaw/skills',
  ]
  const windowsCandidates =
    platform === 'win32'
      ? [
          path.win32.join(String(env.APPDATA || ''), 'npm', 'node_modules', 'openclaw', 'skills'),
          path.win32.join(String(env.ProgramFiles || 'C:\\Program Files'), 'nodejs', 'node_modules', 'openclaw', 'skills'),
        ]
      : []

  return Array.from(new Set([fromExecPath, ...unixCandidates, ...windowsCandidates]))
}

export function resolveBundledSkillsRoot(
  envDir: string | undefined,
  isDirectory: (absPath: string) => boolean = isExistingDirectory,
  nodeExecPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): string {
  const envValue = String(envDir || '').trim()
  if (envValue) return envValue

  const candidates = getBundledSkillsCandidates(nodeExecPath, platform, env)

  const existing = candidates.find((candidate) => isDirectory(candidate))
  return existing || candidates[0]
}

export async function buildGlobalSkillsResponse(
  request: Pick<NextApiRequest, 'method'>,
  deps: GlobalSkillsDependencies,
): Promise<{ statusCode: number; body: GlobalSkillsResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'openclaw_global_skills',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const roots = deps.getRoots()
    const scanned = deps.scanGlobalSkills(roots)

    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_global_skills',
        available: true,
        roots,
        precedence: ['workspace', 'shared', 'bundled'],
        skills: scanned.skills,
        invalid: scanned.invalid,
        counts: scanned.counts,
        lastUpdated: nowIso(deps),
      },
    }
  } catch (error: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_global_skills',
        available: false,
        reason: `Failed to load global skills: ${error?.message || String(error)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

function resolveRoots(): GlobalSkillRoots {
  return {
    shared: path.join(OPENCLAW_DIR, 'skills'),
    bundled: resolveBundledSkillsRoot(process.env.OPENCLAW_BUNDLED_SKILLS_DIR),
    workspace: path.join(WORKSPACE_ROOT, 'skills'),
  }
}

async function loadDependencies(): Promise<GlobalSkillsDependencies> {
  const { scanGlobalSkills } = await import('../../../lib/global-skills')
  return {
    scanGlobalSkills,
    getRoots: resolveRoots,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<GlobalSkillsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildGlobalSkillsResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
