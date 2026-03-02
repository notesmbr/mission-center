import fs from 'fs'
import os from 'os'
import path from 'path'

export const OPENCLAW_HOST_ONLY_REASON = 'Swarm status is only available when Mission Center runs on the OpenClaw host.'

function detectWorkspaceRoot(): string {
  const env =
    process.env.OPENCLAW_WORKSPACE_ROOT ||
    process.env.OPENCLAW_WORKSPACE ||
    process.env.WORKSPACE_ROOT ||
    process.env.WORKSPACE

  if (env && String(env).trim()) return String(env).trim()

  // Heuristic: if mission-center is checked out under a workspace folder, prefer its parent.
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
export const CLAWDBOT_DIR = path.join(WORKSPACE_ROOT, '.clawdbot')
export const ACTIVE_TASKS_PATH = path.join(CLAWDBOT_DIR, 'active-tasks.json')
export const CONFIG_PATH = path.join(CLAWDBOT_DIR, 'config.json')
export const CLAW_WORKTREES_DIR = path.join(CLAWDBOT_DIR, '.claw-worktrees')
export const TASK_LOG_SUFFIX = path.join('.clawdbot', 'session.log')

export const KNOWN_TASK_STATUSES = ['queued', 'running', 'needs_attention', 'done', 'failed'] as const

export type KnownTaskStatus = (typeof KNOWN_TASK_STATUSES)[number]
export type TaskStatus = KnownTaskStatus | 'unknown'

export type SwarmTaskRecord = {
  id?: string
  projectId?: string
  description?: string
  agent?: string
  status?: string
  attempts?: number
  maxAttempts?: number
  updatedAt?: number
  createdAt?: number
  branch?: string
  tmuxSession?: string
  worktree?: string
  note?: string
}

export type PublicSwarmTask = {
  id: string
  projectId?: string
  description?: string
  agent?: string
  status: TaskStatus
  attempts?: number
  maxAttempts?: number
  updatedAt?: number
  createdAt?: number
  branch?: string
  tmuxSession?: string
  worktree?: string
  note?: string
}

export type TaskLogTail =
  | {
      available: true
      path: string
      tail: string
      lineCount: number
    }
  | {
      available: false
      reason: string
    }

export type SwarmConfigProject = {
  id: string
  name?: string
  repo?: string
  enabled?: boolean
}

export function readActiveTasks(): { tasks: SwarmTaskRecord[] } {
  if (!fs.existsSync(ACTIVE_TASKS_PATH)) return { tasks: [] }
  const raw = fs.readFileSync(ACTIVE_TASKS_PATH, 'utf-8')
  const data = JSON.parse(raw)
  return { tasks: Array.isArray(data?.tasks) ? data.tasks : [] }
}

export function readClawdbotConfig(): { projects: SwarmConfigProject[] } {
  if (!fs.existsSync(CONFIG_PATH)) return { projects: [] }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
  const data = JSON.parse(raw)
  return { projects: Array.isArray(data?.projects) ? data.projects : [] }
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function normalizeTaskStatus(value?: string): TaskStatus {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (KNOWN_TASK_STATUSES.includes(normalized as KnownTaskStatus)) {
    return normalized as KnownTaskStatus
  }
  return 'unknown'
}

export function isValidTaskId(taskId: string): boolean {
  if (!taskId || taskId.length > 128) return false
  if (taskId.includes('..')) return false
  return /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(taskId)
}

export function redactSensitiveText(text: string): string {
  return String(text || '')
    .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]{12,}\b/gi, '$1 [REDACTED]')
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*([^\s'",]+)/gi,
      '$1=[REDACTED]',
    )
}

export function isPathInsideOrEqual(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function toWorkspaceRelativePath(maybeAbsolutePath: string): string {
  const absolutePath = path.resolve(String(maybeAbsolutePath || ''))
  const relative = path.relative(WORKSPACE_ROOT, absolutePath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative
  }
  return path.basename(absolutePath)
}

export function sanitizeTask(task: SwarmTaskRecord): PublicSwarmTask {
  const description = asOptionalString(task.description)
  const note = asOptionalString(task.note)
  return {
    id: String(task.id || ''),
    projectId: asOptionalString(task.projectId),
    description: description ? redactSensitiveText(description) : undefined,
    agent: asOptionalString(task.agent),
    status: normalizeTaskStatus(task.status),
    attempts: asOptionalNumber(task.attempts),
    maxAttempts: asOptionalNumber(task.maxAttempts),
    updatedAt: asOptionalNumber(task.updatedAt),
    createdAt: asOptionalNumber(task.createdAt),
    branch: asOptionalString(task.branch),
    tmuxSession: asOptionalString(task.tmuxSession),
    worktree: task.worktree ? toWorkspaceRelativePath(task.worktree) : undefined,
    note: note ? redactSensitiveText(note) : undefined,
  }
}

export function sanitizeTasks(tasks: SwarmTaskRecord[]): PublicSwarmTask[] {
  return (tasks || []).map(sanitizeTask).filter((task) => Boolean(task.id))
}

export function tailLines(text: string, maxLines: number): { tail: string; lineCount: number } {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const safeMax = Math.max(1, maxLines)
  const tail = lines.slice(-safeMax)
  return { tail: tail.join('\n'), lineCount: lines.length }
}

export function resolveTaskSessionLogPath(task: Pick<SwarmTaskRecord, 'id' | 'worktree'>): string | null {
  const taskId = String(task.id || '')
  if (!isValidTaskId(taskId)) return null

  const expectedPath = path.resolve(CLAW_WORKTREES_DIR, taskId, TASK_LOG_SUFFIX)
  if (!isPathInsideOrEqual(CLAW_WORKTREES_DIR, expectedPath)) {
    return null
  }

  if (!expectedPath.endsWith(TASK_LOG_SUFFIX)) {
    return null
  }

  // If worktree is present, only allow the expected path for this task id.
  if (task.worktree) {
    const derivedFromWorktree = path.resolve(String(task.worktree), TASK_LOG_SUFFIX)
    if (derivedFromWorktree !== expectedPath) {
      return null
    }
  }

  return expectedPath
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

export function readTaskSessionLogTail(task: Pick<SwarmTaskRecord, 'id' | 'worktree'>, maxLines = 80): TaskLogTail {
  const logPath = resolveTaskSessionLogPath(task)
  if (!logPath) {
    return { available: false, reason: 'no log available' }
  }

  if (!fs.existsSync(logPath)) {
    return { available: false, reason: 'no log available' }
  }

  let realPath: string
  try {
    realPath = fs.realpathSync(logPath)
  } catch {
    return { available: false, reason: 'no log available' }
  }

  if (!realPath.endsWith(TASK_LOG_SUFFIX)) {
    return { available: false, reason: 'no log available' }
  }
  if (!isPathInsideOrEqual(CLAW_WORKTREES_DIR, realPath)) {
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

export function getSwarmHostAvailability(): { available: true } | { available: false; reason: string } {
  if (!fs.existsSync(CLAWDBOT_DIR)) {
    return { available: false, reason: OPENCLAW_HOST_ONLY_REASON }
  }
  if (!fs.existsSync(ACTIVE_TASKS_PATH)) {
    return { available: false, reason: `${OPENCLAW_HOST_ONLY_REASON} Missing .clawdbot/active-tasks.json.` }
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    return { available: false, reason: `${OPENCLAW_HOST_ONLY_REASON} Missing .clawdbot/config.json.` }
  }
  return { available: true }
}

export default {
  OPENCLAW_HOST_ONLY_REASON,
  WORKSPACE_ROOT,
  CLAWDBOT_DIR,
  ACTIVE_TASKS_PATH,
  CONFIG_PATH,
  CLAW_WORKTREES_DIR,
  TASK_LOG_SUFFIX,
  KNOWN_TASK_STATUSES,
  getSwarmHostAvailability,
  isPathInsideOrEqual,
  isValidTaskId,
  normalizeTaskStatus,
  readTaskSessionLogTail,
  redactSensitiveText,
  resolveTaskSessionLogPath,
  sanitizeTask,
  sanitizeTasks,
  tailLines,
  toWorkspaceRelativePath,
}
