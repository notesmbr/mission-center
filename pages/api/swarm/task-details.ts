import type { NextApiRequest, NextApiResponse } from 'next'
import type { PublicSwarmTask, SwarmTaskRecord, TaskLogTail } from '../../../lib/swarm'

type SwarmTaskDetailsResponse =
  | {
      dataSource: 'clawdbot_swarm_task_details'
      available: true
      task: PublicSwarmTask
      tmuxAttachCommand: string | null
      helperCommands: {
        retryTask: string
        retryProjectFailed: string
        retryProjectNeedsAttention: string
        routeProjectNotifications: string
      }
      log: TaskLogTail
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_swarm_task_details'
      available: false
      reason: string
      lastUpdated: string
    }

export type SwarmTaskDetailsDependencies = {
  readActiveTasks: () => { tasks: SwarmTaskRecord[] }
  sanitizeTask: (task: SwarmTaskRecord) => PublicSwarmTask
  readTaskSessionLogTail: (task: Pick<SwarmTaskRecord, 'id' | 'worktree'>, maxLines?: number) => TaskLogTail
  isValidTaskId: (taskId: string) => boolean
  getSwarmHostAvailability: () => { available: true } | { available: false; reason: string }
  now: () => number
}

function nowIso(deps: Pick<SwarmTaskDetailsDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function readQueryParam(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return ''
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

export async function buildSwarmTaskDetailsResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: SwarmTaskDetailsDependencies,
): Promise<{ statusCode: number; body: SwarmTaskDetailsResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'clawdbot_swarm_task_details',
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
        dataSource: 'clawdbot_swarm_task_details',
        available: false,
        reason: availability.reason,
        lastUpdated: nowIso(deps),
      },
    }
  }

  const taskId = readQueryParam(request.query?.id)
  if (!taskId) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_task_details',
        available: false,
        reason: 'Missing required query parameter: id',
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (!deps.isValidTaskId(taskId)) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_task_details',
        available: false,
        reason: 'Invalid task id format.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const { tasks } = deps.readActiveTasks()
    const rawTask = (tasks || []).find((task) => String(task?.id || '') === taskId)
    if (!rawTask) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_task_details',
          available: false,
          reason: `Task not found: ${taskId}`,
          lastUpdated: nowIso(deps),
        },
      }
    }

    const task = deps.sanitizeTask(rawTask)
    const projectId = task.projectId || 'unassigned'
    const retryStatus = task.status === 'needs_attention' ? 'needs_attention' : 'failed'
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_task_details',
        available: true,
        task,
        tmuxAttachCommand: task.tmuxSession ? `tmux attach -t ${task.tmuxSession}` : null,
        helperCommands: {
          retryTask: `python3 .clawdbot/orchestrator.py retry --task-id ${task.id} --status ${retryStatus}`,
          retryProjectFailed: `python3 .clawdbot/orchestrator.py retry --project ${projectId} --status failed`,
          retryProjectNeedsAttention: `python3 .clawdbot/orchestrator.py retry --project ${projectId} --status needs_attention`,
          routeProjectNotifications: `python3 .clawdbot/orchestrator.py route --project ${projectId} --target <channel-or-thread-id>`,
        },
        log: deps.readTaskSessionLogTail(rawTask, 80),
        lastUpdated: nowIso(deps),
      },
    }
  } catch {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_task_details',
        available: false,
        reason: 'Failed to load swarm task details.',
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<SwarmTaskDetailsDependencies> {
  const { readActiveTasks, sanitizeTask, readTaskSessionLogTail, isValidTaskId, getSwarmHostAvailability } = await import('../../../lib/swarm')

  return {
    readActiveTasks,
    sanitizeTask,
    readTaskSessionLogTail,
    isValidTaskId,
    getSwarmHostAvailability,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SwarmTaskDetailsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildSwarmTaskDetailsResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
