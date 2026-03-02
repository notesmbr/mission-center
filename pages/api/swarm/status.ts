import type { NextApiRequest, NextApiResponse } from 'next'
import type { PublicSwarmTask, SwarmConfigProject, SwarmTaskRecord } from '../../../lib/swarm'

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
      tasks: PublicSwarmTask[]
      projects: Array<{ id: string; name?: string; enabled?: boolean }>
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
  readClawdbotConfig: () => { projects: SwarmConfigProject[] }
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
    const { projects: rawProjects } = deps.readClawdbotConfig()
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

    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_status',
        available: true,
        summary,
        groupedTasks,
        tasks,
        projects: configProjects,
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

