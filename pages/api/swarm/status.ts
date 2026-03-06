import type { NextApiRequest, NextApiResponse } from 'next'
import {
  ORCHESTRATOR_HELPER_COMMANDS,
  type PublicSwarmTask,
  type SwarmConfig,
  type SwarmTaskNotificationKind,
  type SwarmTaskRecord,
} from '../../../lib/swarm'

type SwarmStatusResponse =
  | {
      dataSource: 'clawdbot_swarm_status'
      available: true
      summary: {
        total: number
        queued: number
        running: number
        needs_attention: number
        done: number
        failed: number
      }
      groupedTasks: Array<{ projectId: string; projectName?: string; tasks: PublicSwarmTask[] }>
      projectSummaries: Array<{
        projectId: string
        projectName?: string
        enabled?: boolean
        total: number
        queued: number
        running: number
        needs_attention: number
        done: number
        failed: number
        unknown: number
      }>
      tasks: PublicSwarmTask[]
      projects: Array<{ id: string; name?: string; enabled?: boolean }>
      orchestrator: {
        doneCriteria: {
          progressOnCiGreen: boolean
        }
        notifications: Record<
          SwarmTaskNotificationKind,
          { enabled: boolean; channel: string; silent: boolean; defaultTarget?: string }
        >
        helperCommands: {
          route: string
          retry: string
        }
      }
      notificationRoutes: Array<{
        projectId: string
        readyForReview?: string
        researchComplete?: string
        needsAttention?: string
        taskFailed?: string
      }>
      filters: {
        projectIds: string[]
        agents: string[]
        statuses: string[]
      }
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_swarm_status'
      available: false
      reason: string
      lastUpdated: string
    }

export type SwarmStatusDependencies = {
  readActiveTasks: () => { tasks: SwarmTaskRecord[] }
  readClawdbotConfig: () => SwarmConfig
  sanitizeTasks: (tasks: SwarmTaskRecord[]) => PublicSwarmTask[]
  getSwarmHostAvailability: () => { available: true } | { available: false; reason: string }
  now: () => number
}

function nowIso(deps: Pick<SwarmStatusDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function sortTasksByUpdated(tasks: PublicSwarmTask[]): PublicSwarmTask[] {
  return [...tasks].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
}

function buildProjectSummary(
  projectId: string,
  projectName: string | undefined,
  enabled: boolean | undefined,
  tasks: PublicSwarmTask[],
) {
  let queued = 0
  let running = 0
  let needs_attention = 0
  let done = 0
  let failed = 0
  let unknown = 0

  for (const task of tasks) {
    if (task.status === 'queued') queued += 1
    else if (task.status === 'running') running += 1
    else if (task.status === 'needs_attention') needs_attention += 1
    else if (task.status === 'done') done += 1
    else if (task.status === 'failed') failed += 1
    else unknown += 1
  }

  return {
    projectId,
    projectName,
    enabled,
    total: tasks.length,
    queued,
    running,
    needs_attention,
    done,
    failed,
    unknown,
  }
}

export async function buildSwarmStatusResponse(
  request: Pick<NextApiRequest, 'method'>,
  deps: SwarmStatusDependencies,
): Promise<{ statusCode: number; body: SwarmStatusResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'clawdbot_swarm_status',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const availability = deps.getSwarmHostAvailability()
  if (!availability.available) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_status',
        available: false,
        reason: availability.reason,
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const { tasks: rawTasks } = deps.readActiveTasks()
    const { projects: rawProjects, doneCriteria, notifications } = deps.readClawdbotConfig()
    const tasks = sortTasksByUpdated(deps.sanitizeTasks(rawTasks || []))

    const summary = {
      total: tasks.length,
      queued: tasks.filter((task) => task.status === 'queued').length,
      running: tasks.filter((task) => task.status === 'running').length,
      needs_attention: tasks.filter((task) => task.status === 'needs_attention').length,
      done: tasks.filter((task) => task.status === 'done').length,
      failed: tasks.filter((task) => task.status === 'failed').length,
    }

    const projectNameById = new Map<string, string>()
    const configProjects: Array<{ id: string; name?: string; enabled?: boolean }> = []

    for (const project of rawProjects || []) {
      const id = String(project?.id || '').trim()
      if (!id) continue
      const safeProject = {
        id,
        name: project?.name ? String(project.name) : undefined,
        enabled: project?.enabled !== false,
      }
      configProjects.push(safeProject)
      if (safeProject.name) {
        projectNameById.set(id, safeProject.name)
      }
    }

    const groupedMap = new Map<string, PublicSwarmTask[]>()
    for (const task of tasks) {
      const projectId = task.projectId || 'unassigned'
      const bucket = groupedMap.get(projectId)
      if (bucket) bucket.push(task)
      else groupedMap.set(projectId, [task])
    }

    const groupedTasks = Array.from(groupedMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([projectId, projectTasks]) => ({
        projectId,
        projectName: projectNameById.get(projectId),
        tasks: sortTasksByUpdated(projectTasks),
      }))

    const projectSummaryMap = new Map<
      string,
      {
        projectName?: string
        enabled?: boolean
        tasks: PublicSwarmTask[]
      }
    >()

    for (const project of configProjects) {
      projectSummaryMap.set(project.id, {
        projectName: project.name,
        enabled: project.enabled,
        tasks: [],
      })
    }

    for (const task of tasks) {
      const projectId = task.projectId || 'unassigned'
      const bucket = projectSummaryMap.get(projectId)
      if (bucket) bucket.tasks.push(task)
      else {
        projectSummaryMap.set(projectId, {
          projectName: projectNameById.get(projectId),
          enabled: undefined,
          tasks: [task],
        })
      }
    }

    const projectSummaries = Array.from(projectSummaryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([projectId, item]) => buildProjectSummary(projectId, item.projectName, item.enabled, sortTasksByUpdated(item.tasks)))

    const projectIdSet = new Set<string>()
    const agentsSet = new Set<string>()
    const statusSet = new Set<string>()

    for (const project of configProjects) {
      projectIdSet.add(project.id)
    }
    for (const task of tasks) {
      projectIdSet.add(task.projectId || 'unassigned')
      if (task.agent) agentsSet.add(task.agent)
      statusSet.add(task.status)
    }

    const notificationKinds: SwarmTaskNotificationKind[] = ['readyForReview', 'researchComplete', 'needsAttention', 'taskFailed']
    const notificationSettings = Object.fromEntries(
      notificationKinds.map((kind) => {
        const raw = notifications?.[kind]
        return [
          kind,
          {
            enabled: raw?.enabled === true,
            channel: typeof raw?.channel === 'string' && raw.channel ? raw.channel : 'discord',
            silent: raw?.silent === true,
            defaultTarget:
              typeof raw?.defaultTarget === 'string' && raw.defaultTarget.trim() ? raw.defaultTarget.trim() : undefined,
          },
        ]
      }),
    ) as Record<SwarmTaskNotificationKind, { enabled: boolean; channel: string; silent: boolean; defaultTarget?: string }>

    const routeProjects = Array.from(projectIdSet).sort()
    const notificationRoutes = routeProjects.map((projectId) => ({
      projectId,
      readyForReview: notifications?.readyForReview?.targets?.[projectId],
      researchComplete: notifications?.researchComplete?.targets?.[projectId],
      needsAttention: notifications?.needsAttention?.targets?.[projectId],
      taskFailed: notifications?.taskFailed?.targets?.[projectId],
    }))

    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_status',
        available: true,
        summary,
        groupedTasks,
        projectSummaries,
        tasks,
        projects: configProjects,
        orchestrator: {
          doneCriteria: {
            progressOnCiGreen: doneCriteria?.progressOnCiGreen === true,
          },
          notifications: notificationSettings,
          helperCommands: ORCHESTRATOR_HELPER_COMMANDS,
        },
        notificationRoutes,
        filters: {
          projectIds: Array.from(projectIdSet).sort(),
          agents: Array.from(agentsSet).sort(),
          statuses: Array.from(statusSet).sort(),
        },
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_status',
        available: false,
        reason: 'Failed to load swarm status.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<SwarmStatusDependencies> {
  const { readActiveTasks, readClawdbotConfig, sanitizeTasks, getSwarmHostAvailability } = await import('../../../lib/swarm')

  return {
    readActiveTasks,
    readClawdbotConfig,
    sanitizeTasks,
    getSwarmHostAvailability,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SwarmStatusResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildSwarmStatusResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
