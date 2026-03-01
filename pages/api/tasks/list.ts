import type { NextApiRequest, NextApiResponse } from 'next'
import type { PublicTask, TaskRecord } from '../../../lib/tasks'

type TasksListResponse =
  | {
      dataSource: 'clawdbot_active_tasks'
      available: true
      tasks: PublicTask[]
      projects: Array<{ id: string; name?: string; enabled?: boolean }>
      syncAttempted: boolean
      syncThrottled: boolean
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_active_tasks'
      available: false
      reason: string
      lastUpdated: string
    }

export type TasksListDependencies = {
  readActiveTasks: () => { tasks: TaskRecord[] }
  readClawdbotConfig: () => { projects: Array<{ id?: string; name?: string; enabled?: boolean }> }
  runOrchestratorCommand: (args: string[], timeoutMs?: number) => Promise<unknown>
  sanitizeTasks: (tasks: TaskRecord[]) => PublicTask[]
  matchesProjectFilter: (projectId: string | undefined, selectedProject: string) => boolean
  now: () => number
}

const MIN_SYNC_INTERVAL_MS = 60_000
let lastSyncAtMs = 0

function readQueryParam(value: unknown, fallback = ''): string {
  if (Array.isArray(value)) {
    if (!value.length) return fallback
    return String(value[0] || '').trim()
  }
  if (value == null) return fallback
  return String(value).trim()
}

function normalizeSelectedProject(raw: string): string {
  if (!raw || raw === 'all') return 'all'
  return /^[a-zA-Z0-9._-]+$/.test(raw) ? raw : 'all'
}

function nowIso(deps: Pick<TasksListDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export function __resetTasksSyncThrottleForTests() {
  lastSyncAtMs = 0
}

export async function buildTasksListResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: TasksListDependencies,
): Promise<{ statusCode: number; body: TasksListResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'clawdbot_active_tasks',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const wantSync = readQueryParam(request.query?.sync, '') === '1'
  const selectedProject = normalizeSelectedProject(readQueryParam(request.query?.project, 'all'))

  try {
    let syncAttempted = false
    let syncThrottled = false

    if (wantSync) {
      const now = deps.now()
      if (now - lastSyncAtMs < MIN_SYNC_INTERVAL_MS) {
        syncThrottled = true
      } else {
        syncAttempted = true
        lastSyncAtMs = now
        try {
          // Updates task statuses based on tmux + PR/CI checks.
          await deps.runOrchestratorCommand(['check'], 25_000)
        } catch {
          // Non-fatal: fall back to last known active-tasks.json
        }
      }
    }

    const { tasks } = deps.readActiveTasks()
    const { projects } = deps.readClawdbotConfig()
    const sanitizedTasks = deps.sanitizeTasks(tasks)
    const safeTasks = sanitizedTasks.filter((task) => deps.matchesProjectFilter(task.projectId, selectedProject))

    const safeProjectsMap = new Map<string, { id: string; name?: string; enabled?: boolean }>()
    for (const project of projects || []) {
      if (typeof project?.id !== 'string') continue
      const id = project.id.trim()
      if (!id) continue
      safeProjectsMap.set(id, {
        id,
        name: project.name || undefined,
        enabled: project.enabled !== false,
      })
    }

    // Always include project IDs discovered from active tasks so the project filter
    // can switch across all known projects, even when config.json is incomplete.
    for (const task of sanitizedTasks) {
      const id = String(task?.projectId || '').trim()
      if (!id || safeProjectsMap.has(id)) continue
      safeProjectsMap.set(id, { id, enabled: true })
    }
    const safeProjects = Array.from(safeProjectsMap.values()).sort((a, b) => a.id.localeCompare(b.id))

    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_active_tasks',
        available: true,
        tasks: safeTasks,
        projects: safeProjects,
        syncAttempted,
        syncThrottled,
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_active_tasks',
        available: false,
        reason: `Failed to load clawdbot tasks: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TasksListDependencies> {
  const { readActiveTasks, readClawdbotConfig, runOrchestratorCommand } = await import('../_lib/clawdbot')
  const { sanitizeTasks, matchesProjectFilter } = await import('../../../lib/tasks')
  return {
    readActiveTasks,
    readClawdbotConfig,
    runOrchestratorCommand,
    sanitizeTasks,
    matchesProjectFilter,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TasksListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      dataSource: 'clawdbot_active_tasks',
      available: false,
      reason: 'Method not allowed. Use GET.',
      lastUpdated: new Date().toISOString(),
    })
  }

  const deps = await loadDependencies()
  const result = await buildTasksListResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
