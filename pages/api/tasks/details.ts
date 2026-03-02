import type { NextApiRequest, NextApiResponse } from 'next'
import type { PublicTask, TaskLogTail, TaskRecord } from '../../../lib/tasks'

type TaskDetailsResponse =
  | {
      dataSource: 'clawdbot_task_details'
      available: true
      task: PublicTask
      log: TaskLogTail
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_task_details'
      available: false
      reason: string
      lastUpdated: string
    }

export type TaskDetailsDependencies = {
  readActiveTasks: () => { tasks: TaskRecord[] }
  sanitizeTask: (task: TaskRecord) => PublicTask
  readTaskSessionLogTail: (task: Pick<TaskRecord, 'id' | 'worktree'>, maxLines?: number) => TaskLogTail
  now: () => number
}

function readQueryParam(value: unknown): string {
  if (Array.isArray(value)) {
    if (!value.length) return ''
    return String(value[0] || '').trim()
  }
  return String(value || '').trim()
}

function nowIso(deps: Pick<TaskDetailsDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export function isValidTaskId(taskId: string): boolean {
  if (!taskId || taskId.length > 128) return false
  if (taskId.includes('..')) return false
  return /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(taskId)
}

export async function buildTaskDetailsResponse(
  request: Pick<NextApiRequest, 'method' | 'query'>,
  deps: TaskDetailsDependencies,
): Promise<{ statusCode: number; body: TaskDetailsResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'clawdbot_task_details',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const taskId = readQueryParam(request.query?.id)
  if (!taskId) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_task_details',
        available: false,
        reason: 'Missing required query parameter: id',
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (!isValidTaskId(taskId)) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_task_details',
        available: false,
        reason: 'Invalid task id format.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const { tasks } = deps.readActiveTasks()
    const rawTask = tasks.find((task) => String(task?.id || '') === taskId)

    if (!rawTask) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_task_details',
          available: false,
          reason: `Task not found: ${taskId}`,
          lastUpdated: nowIso(deps),
        },
      }
    }

    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_task_details',
        available: true,
        task: deps.sanitizeTask(rawTask),
        log: deps.readTaskSessionLogTail(rawTask, 120),
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_task_details',
        available: false,
        reason: `Failed to load task details: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<TaskDetailsDependencies> {
  const { readActiveTasks } = await import('../_lib/clawdbot')
  const { sanitizeTask, readTaskSessionLogTail } = await import('../../../lib/tasks')
  return {
    readActiveTasks,
    sanitizeTask,
    readTaskSessionLogTail,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<TaskDetailsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      dataSource: 'clawdbot_task_details',
      available: false,
      reason: 'Method not allowed. Use GET.',
      lastUpdated: new Date().toISOString(),
    })
  }

  const deps = await loadDependencies()
  const result = await buildTaskDetailsResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
