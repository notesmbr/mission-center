import type { NextApiRequest, NextApiResponse } from 'next'

type SwarmHelpersResponse =
  | {
      dataSource: 'clawdbot_swarm_helpers'
      available: true
      supportedCommands: Array<'route' | 'retry'>
      commandTemplates: {
        route: string
        retry: string
      }
      command?: 'route' | 'retry'
      args?: string[]
      output?: unknown
      stdout?: string
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_swarm_helpers'
      available: false
      reason: string
      lastUpdated: string
    }

export type SwarmHelpersDependencies = {
  runOrchestratorCommand: (args: string[], timeoutMs?: number) => Promise<string>
  isValidTaskId: (taskId: string) => boolean
  getSwarmHostAvailability: () => { available: true } | { available: false; reason: string }
  now: () => number
}

type HelpersBody = {
  command?: unknown
  projectId?: unknown
  target?: unknown
  channel?: unknown
  taskId?: unknown
  status?: unknown
  limit?: unknown
  resetAttempts?: unknown
}

function nowIso(deps: Pick<SwarmHelpersDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

function parseLastJsonObject(stdout: string): unknown {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  const start = trimmed.lastIndexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      // continue
    }
  }
  return null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function isValidProjectId(value: string): boolean {
  if (!value || value.length > 120) return false
  return /^[a-zA-Z0-9._-]+$/.test(value)
}

function isValidRouteTarget(value: string): boolean {
  if (!value || value.length > 120) return false
  return /^(?:channel:)?[0-9]{6,}$/.test(value)
}

function isValidChannel(value: string): boolean {
  if (!value || value.length > 40) return false
  return /^[a-zA-Z0-9_-]+$/.test(value)
}

export async function buildSwarmHelpersResponse(
  request: Pick<NextApiRequest, 'method' | 'body'>,
  deps: SwarmHelpersDependencies,
): Promise<{ statusCode: number; body: SwarmHelpersResponse }> {
  const supportedCommands: Array<'route' | 'retry'> = ['route', 'retry']
  const commandTemplates = {
    route: 'python3 .clawdbot/orchestrator.py route --project <project-id> --target <channel-or-thread-id>',
    retry: 'python3 .clawdbot/orchestrator.py retry --status <failed|needs_attention> [--task-id <id>] [--project <project-id>]',
  }

  if (request.method && request.method !== 'GET' && request.method !== 'POST') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: 'Method not allowed. Use GET or POST.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const availability = deps.getSwarmHostAvailability()
  if (!availability.available) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: availability.reason,
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (!request.method || request.method === 'GET') {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: true,
        supportedCommands,
        commandTemplates,
        lastUpdated: nowIso(deps),
      },
    }
  }

  const body = (request.body || {}) as HelpersBody
  const command = asString(body.command)

  if (command !== 'route' && command !== 'retry') {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: "Invalid command. Supported commands: 'route', 'retry'.",
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (command === 'route') {
    const projectId = asString(body.projectId).toLowerCase()
    const target = asString(body.target)
    const channel = asString(body.channel) || 'discord'

    if (!isValidProjectId(projectId)) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_helpers',
          available: false,
          reason: 'Invalid projectId format.',
          lastUpdated: nowIso(deps),
        },
      }
    }

    if (!isValidRouteTarget(target)) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_helpers',
          available: false,
          reason: 'Invalid target format. Use digits or channel:<digits>.',
          lastUpdated: nowIso(deps),
        },
      }
    }

    if (!isValidChannel(channel)) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_helpers',
          available: false,
          reason: 'Invalid channel format.',
          lastUpdated: nowIso(deps),
        },
      }
    }

    const args = ['route', '--project', projectId, '--target', target, '--channel', channel]
    try {
      const stdout = await deps.runOrchestratorCommand(args, 25_000)
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_helpers',
          available: true,
          supportedCommands,
          commandTemplates,
          command: 'route',
          args,
          output: parseLastJsonObject(stdout),
          stdout: String(stdout || '').trim().slice(0, 2000),
          lastUpdated: nowIso(deps),
        },
      }
    } catch (err: any) {
      return {
        statusCode: 200,
        body: {
          dataSource: 'clawdbot_swarm_helpers',
          available: false,
          reason: `Route command failed: ${err?.message || String(err)}`,
          lastUpdated: nowIso(deps),
        },
      }
    }
  }

  const taskId = asString(body.taskId)
  const projectId = asString(body.projectId).toLowerCase()
  const status = asString(body.status) || 'failed'
  const limit = asOptionalNumber(body.limit)
  const resetAttempts = asBoolean(body.resetAttempts)

  if (taskId && !deps.isValidTaskId(taskId)) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: 'Invalid taskId format.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (projectId && !isValidProjectId(projectId)) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: 'Invalid projectId format.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (status !== 'failed' && status !== 'needs_attention') {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: "Invalid retry status. Use 'failed' or 'needs_attention'.",
        lastUpdated: nowIso(deps),
      },
    }
  }

  if (limit != null && (!Number.isInteger(limit) || limit < 0 || limit > 200)) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: 'Invalid limit. Use an integer between 0 and 200.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  const args = ['retry', '--status', status]
  if (taskId) args.push('--task-id', taskId)
  if (projectId) args.push('--project', projectId)
  if (limit != null) args.push('--limit', String(limit))
  if (resetAttempts) args.push('--reset-attempts')

  try {
    const stdout = await deps.runOrchestratorCommand(args, 25_000)
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: true,
        supportedCommands,
        commandTemplates,
        command: 'retry',
        args,
        output: parseLastJsonObject(stdout),
        stdout: String(stdout || '').trim().slice(0, 2000),
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'clawdbot_swarm_helpers',
        available: false,
        reason: `Retry command failed: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<SwarmHelpersDependencies> {
  const { runOrchestratorCommand } = await import('../_lib/clawdbot')
  const { isValidTaskId, getSwarmHostAvailability } = await import('../../../lib/swarm')
  return {
    runOrchestratorCommand,
    isValidTaskId,
    getSwarmHostAvailability,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SwarmHelpersResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
  }

  const deps = await loadDependencies()
  const result = await buildSwarmHelpersResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}

