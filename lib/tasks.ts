import fs from 'fs'
import os from 'os'
import path from 'path'

function detectWorkspaceRoot(): string {
  const env =
    process.env.OPENCLAW_WORKSPACE_ROOT ||
    process.env.OPENCLAW_WORKSPACE ||
    process.env.WORKSPACE_ROOT ||
    process.env.WORKSPACE

  if (env && String(env).trim()) return String(env).trim()

  // Heuristic: if we're running inside a repo that lives directly under the OpenClaw workspace,
  // use the parent directory.
  try {
    const parent = path.resolve(process.cwd(), '..')
    if (fs.existsSync(path.join(parent, '.clawdbot'))) return parent
  } catch {
    // ignore
  }

  const home = process.env.HOME || os.homedir()
  const openclawDir = process.env.OPENCLAW_DIR || path.join(home, '.openclaw')
  return path.join(openclawDir, 'workspace')
}

export const WORKSPACE_ROOT = detectWorkspaceRoot()
export const CLAW_WORKTREES_DIR = path.join(WORKSPACE_ROOT, '.clawdbot', '.claw-worktrees')

export const KNOWN_TASK_STATUSES = ['queued', 'running', 'needs_attention', 'done', 'failed'] as const

export type TaskStatus = (typeof KNOWN_TASK_STATUSES)[number] | 'unknown'

export type PublicTask = {
  id: string
  projectId?: string
  agent?: string
  description?: string
  branch?: string
  tmuxSession?: string
  status: TaskStatus
  createdAt?: number
  updatedAt?: number
  attempts?: number
  maxAttempts?: number
  worktree?: string
  startedAt?: number
}

export type TaskRecord = {
  id?: string
  projectId?: string
  agent?: string
  description?: string
  branch?: string
  tmuxSession?: string
  status?: string
  createdAt?: number
  updatedAt?: number
  attempts?: number
  maxAttempts?: number
  worktree?: string
  startedAt?: number
}

export type TaskLogTail =
  | { available: true; path: string; tail: string; lineCount: number }
  | { available: false; reason: string }

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizeTaskStatus(value?: string): TaskStatus {
  if (!value) return 'unknown'
  const normalized = String(value).trim().toLowerCase()
  if (KNOWN_TASK_STATUSES.includes(normalized as (typeof KNOWN_TASK_STATUSES)[number])) {
    return normalized as TaskStatus
  }
  return 'unknown'
}

function isPathInsideOrEqual(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function toWorkspaceRelativePath(maybeAbsolutePath: string): string {
  const absolutePath = path.resolve(String(maybeAbsolutePath || ''))
  const relative = path.relative(WORKSPACE_ROOT, absolutePath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative
  }
  // Avoid leaking arbitrary absolute paths.
  return path.basename(absolutePath)
}

export function sanitizeTask(task: TaskRecord): PublicTask {
  return {
    id: String(task.id || ''),
    projectId: task.projectId || undefined,
    agent: task.agent || undefined,
    description: task.description || undefined,
    branch: task.branch || undefined,
    tmuxSession: task.tmuxSession || undefined,
    status: normalizeTaskStatus(task.status),
    createdAt: asOptionalNumber(task.createdAt),
    updatedAt: asOptionalNumber(task.updatedAt),
    attempts: asOptionalNumber(task.attempts),
    maxAttempts: asOptionalNumber(task.maxAttempts),
    worktree: task.worktree ? toWorkspaceRelativePath(task.worktree) : undefined,
    startedAt: asOptionalNumber(task.startedAt),
  }
}

export function sanitizeTasks(tasks: TaskRecord[]): PublicTask[] {
  return tasks.map(sanitizeTask).filter((task) => Boolean(task.id))
}

export function matchesProjectFilter(projectId: string | undefined, selectedProject: string): boolean {
  if (!selectedProject || selectedProject === 'all') return true
  return projectId === selectedProject
}

export function redactSensitiveText(text: string): string {
  return String(text || '')
    .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]{12,}\b/gi, '$1 [REDACTED]')
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*([^\s'"]+)/gi,
      '$1=[REDACTED]',
    )
}

export function resolveTaskSessionLogPath(task: Pick<TaskRecord, 'id' | 'worktree'>): string | null {
  const candidates = new Set<string>()
  const logSuffix = path.join('.clawdbot', 'session.log')
  const taskId = task.id ? String(task.id) : ''
  const expectedLogPath = taskId ? path.resolve(CLAW_WORKTREES_DIR, taskId, logSuffix) : null

  if (taskId && expectedLogPath && !isPathInsideOrEqual(CLAW_WORKTREES_DIR, expectedLogPath)) {
    return null
  }

  if (task.worktree) {
    candidates.add(path.resolve(task.worktree, logSuffix))
  }

  if (expectedLogPath) {
    candidates.add(expectedLogPath)
  }

  for (const candidate of candidates) {
    const normalized = path.resolve(candidate)
    if (!normalized.endsWith(logSuffix)) continue
    if (!isPathInsideOrEqual(CLAW_WORKTREES_DIR, normalized)) continue
    if (expectedLogPath && normalized !== expectedLogPath) continue

    return normalized
  }

  return null
}

export function tailLines(text: string, maxLines: number): { tail: string; lineCount: number } {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim().length > 0)
  const tail = lines.slice(-Math.max(1, maxLines))
  return { tail: tail.join('\n'), lineCount: lines.length }
}

function readUtf8Tail(realPath: string, maxBytes = 200_000): string {
  const stat = fs.statSync(realPath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const length = size - start

  const fd = fs.openSync(realPath, 'r')
  try {
    const buf = Buffer.alloc(length)
    fs.readSync(fd, buf, 0, length, start)
    return buf.toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

export function readTaskSessionLogTail(task: Pick<TaskRecord, 'id' | 'worktree'>, maxLines = 120): TaskLogTail {
  const logPath = resolveTaskSessionLogPath(task)
  if (!logPath) {
    return { available: false, reason: 'no log available' }
  }

  if (!fs.existsSync(logPath)) {
    return { available: false, reason: 'no log available' }
  }

  // Prevent symlink-based escapes outside the allowed task worktrees directory.
  let realPath: string
  try {
    realPath = fs.realpathSync(logPath)
    if (!realPath.endsWith(path.join('.clawdbot', 'session.log'))) {
      return { available: false, reason: 'no log available' }
    }
    if (!isPathInsideOrEqual(CLAW_WORKTREES_DIR, realPath)) {
      return { available: false, reason: 'no log available' }
    }
  } catch {
    return { available: false, reason: 'no log available' }
  }

  try {
    const text = readUtf8Tail(realPath)
    const { tail, lineCount } = tailLines(text, maxLines)
    return {
      available: true,
      path: toWorkspaceRelativePath(realPath),
      tail: redactSensitiveText(tail),
      lineCount,
    }
  } catch {
    return { available: false, reason: 'no log available' }
  }
}

export default {
  WORKSPACE_ROOT,
  CLAW_WORKTREES_DIR,
  KNOWN_TASK_STATUSES,
  matchesProjectFilter,
  normalizeTaskStatus,
  redactSensitiveText,
  readTaskSessionLogTail,
  resolveTaskSessionLogPath,
  sanitizeTask,
  sanitizeTasks,
  tailLines,
}
