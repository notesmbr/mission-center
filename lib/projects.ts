import fs from 'fs'
import path from 'path'

import {
  WORKSPACE_ROOT,
  CLAWDBOT_DIR,
  redactSensitiveText,
  toWorkspaceRelativePath,
  type PublicSwarmTask,
  type SwarmConfigProject,
} from './swarm'

export const PROJECT_VAULT_ROOT = path.join(CLAWDBOT_DIR, 'projects')

export type ProjectDoc = {
  kind: 'repo' | 'vault'
  path: string
  title: string | null
  excerpt: string
  updatedAtMs: number | null
}

export type ProjectSummary = {
  id: string
  name?: string
  enabled?: boolean
  repo?: string
  repoRelative?: string
  tasks: PublicSwarmTask[]
  summary: {
    total: number
    queued: number
    running: number
    needs_attention: number
    done: number
    failed: number
    unknown: number
  }
  docs: ProjectDoc[]
}

function isPathInsideOrEqual(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

function parseTitleFromMarkdown(markdown: string): string | null {
  const lines = String(markdown || '').split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^\s*#\s+(.+)\s*$/)
    if (m) return m[1].trim()
  }
  return null
}

export function readTextExcerpt(absPath: string, maxLines = 40, maxChars = 6000): { title: string | null; excerpt: string } {
  const raw = fs.readFileSync(absPath, 'utf-8')
  const lines = raw.split(/\r?\n/).slice(0, Math.max(1, maxLines))
  const excerpt = lines.join('\n').slice(0, Math.max(1, maxChars))
  const redacted = redactSensitiveText(excerpt)
  return { title: parseTitleFromMarkdown(redacted), excerpt: redacted }
}

export function buildProjectDocList(project: Pick<SwarmConfigProject, 'id' | 'repo'>): Array<{ kind: 'repo' | 'vault'; absPath: string; relPath: string }> {
  const out: Array<{ kind: 'repo' | 'vault'; absPath: string; relPath: string }> = []

  const repo = project.repo ? String(project.repo) : ''
  if (repo) {
    const repoRoot = safeRealpath(repo)

    const addRepoFile = (relPath: string) => {
      const absPath = safeRealpath(path.join(repoRoot, relPath))
      if (!isPathInsideOrEqual(repoRoot, absPath)) return
      if (!fs.existsSync(absPath)) return
      if (!/\.md$/i.test(absPath)) return
      out.push({ kind: 'repo', absPath, relPath })
    }

    // Always include README.md if present.
    addRepoFile('README.md')

    // Optional project planning docs.
    addRepoFile('tasks.md')
    addRepoFile('SETUP_GUIDE.md')

    // TripLatch: show the key AppStoreAssets markdown files (limited).
    const appStoreAssetsDir = path.join(repoRoot, 'AppStoreAssets')
    if (fs.existsSync(appStoreAssetsDir) && fs.statSync(appStoreAssetsDir).isDirectory()) {
      const entries = fs
        .readdirSync(appStoreAssetsDir)
        .filter((f) => f.toLowerCase().endsWith('.md'))
        .filter((f) => /competitor|gap|release|app\s*store|metadata|launch/i.test(f))
        .slice(0, 6)

      for (const f of entries) {
        addRepoFile(path.join('AppStoreAssets', f))
      }
    }
  }

  // Vault docs maintained by the swarm context builder (if present).
  const vaultDir = path.join(PROJECT_VAULT_ROOT, project.id)
  if (fs.existsSync(vaultDir) && fs.statSync(vaultDir).isDirectory()) {
    const vaultFiles = ['project-context.md', 'roadmap.md', 'decisions.md', 'research.md', 'definition-of-done.md']
    for (const f of vaultFiles) {
      const absPath = safeRealpath(path.join(vaultDir, f))
      if (!isPathInsideOrEqual(vaultDir, absPath)) continue
      if (!fs.existsSync(absPath)) continue
      out.push({ kind: 'vault', absPath, relPath: path.join('.clawdbot', 'projects', project.id, f) })
    }
  }

  return out
}

export function summarizeTasks(tasks: PublicSwarmTask[]) {
  let queued = 0
  let running = 0
  let needs_attention = 0
  let done = 0
  let failed = 0
  let unknown = 0

  for (const t of tasks) {
    if (t.status === 'queued') queued += 1
    else if (t.status === 'running') running += 1
    else if (t.status === 'needs_attention') needs_attention += 1
    else if (t.status === 'done') done += 1
    else if (t.status === 'failed') failed += 1
    else unknown += 1
  }

  return {
    total: tasks.length,
    queued,
    running,
    needs_attention,
    done,
    failed,
    unknown,
  }
}

export function buildProjectSummary(project: SwarmConfigProject, tasks: PublicSwarmTask[]): ProjectSummary {
  const docs: ProjectDoc[] = []
  for (const item of buildProjectDocList(project)) {
    try {
      const st = fs.statSync(item.absPath)
      const { title, excerpt } = readTextExcerpt(item.absPath)
      docs.push({
        kind: item.kind,
        path: item.kind === 'repo' ? item.relPath : item.relPath,
        title,
        excerpt,
        updatedAtMs: st?.mtimeMs ? Math.round(st.mtimeMs) : null,
      })
    } catch {
      // ignore
    }
  }

  const repoRelative = project.repo ? toWorkspaceRelativePath(project.repo) : undefined

  return {
    id: project.id,
    name: project.name,
    enabled: project.enabled !== false,
    repo: project.repo,
    repoRelative,
    tasks,
    summary: summarizeTasks(tasks),
    docs,
  }
}

export function getProjectSummaries(args: {
  projects: SwarmConfigProject[]
  tasks: PublicSwarmTask[]
}): ProjectSummary[] {
  const enabled = (args.projects || []).filter((p) => p?.id && p.enabled !== false)

  const tasksByProject = new Map<string, PublicSwarmTask[]>()
  for (const t of args.tasks || []) {
    const pid = t.projectId || 'unassigned'
    const list = tasksByProject.get(pid)
    if (list) list.push(t)
    else tasksByProject.set(pid, [t])
  }

  const out = enabled.map((p) => buildProjectSummary(p, tasksByProject.get(p.id) || []))
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export default {
  WORKSPACE_ROOT,
  PROJECT_VAULT_ROOT,
  buildProjectDocList,
  buildProjectSummary,
  getProjectSummaries,
  readTextExcerpt,
  summarizeTasks,
}
