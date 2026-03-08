import type { NextApiRequest, NextApiResponse } from 'next'

type AgentSummary = {
  agentId: string
  key: string
  kind: string
  age: number
  model?: string
  percentUsed?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

type StatusResponse =
  | {
      dataSource: 'openclaw_status_json'
      available: true
      openclaw: {
        reachable: true
        dashboardUrl?: string
        gatewayBind?: string
        tailscale?: string
        heartbeatEvery?: string
        sessionCount?: number
        defaultModel?: string
      }
      sessions: AgentSummary[]
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_status_json'
      available: false
      reason: string
      lastUpdated: string
    }

export type StatusDependencies = {
  runOpenClawCommand: (args: string[], timeoutMs?: number) => Promise<string>
  now: () => number
}

function nowIso(deps: Pick<StatusDependencies, 'now'>): string {
  return new Date(deps.now()).toISOString()
}

export async function buildStatusResponse(
  request: Pick<NextApiRequest, 'method'>,
  deps: StatusDependencies,
): Promise<{ statusCode: number; body: StatusResponse }> {
  if (request.method && request.method !== 'GET') {
    return {
      statusCode: 405,
      body: {
        dataSource: 'openclaw_status_json',
        available: false,
        reason: 'Method not allowed. Use GET.',
        lastUpdated: nowIso(deps),
      },
    }
  }

  try {
    const out: string = await deps.runOpenClawCommand(['status', '--json'], 5000)

    const data = JSON.parse(out)

    const heartbeatEvery = data?.heartbeat?.agents?.[0]?.every
    const defaultModel = data?.sessions?.defaults?.model

    const sessions: AgentSummary[] = (data?.sessions?.recent || []).map((s: any) => ({
      agentId: s.agentId,
      key: s.key,
      kind: s.kind,
      age: s.age,
      model: s.model,
      percentUsed: s.percentUsed,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      totalTokens: s.totalTokens,
    }))

    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_status_json',
        available: true,
        openclaw: {
          reachable: true,
          dashboardUrl: data?.dashboardUrl,
          gatewayBind: data?.gateway?.bind,
          tailscale: data?.tailscale?.state || data?.tailscale || undefined,
          heartbeatEvery,
          sessionCount: data?.sessions?.count,
          defaultModel,
        },
        sessions,
        lastUpdated: nowIso(deps),
      },
    }
  } catch (err: any) {
    return {
      statusCode: 200,
      body: {
        dataSource: 'openclaw_status_json',
        available: false,
        reason: `Failed to run openclaw status --json: ${err?.message || String(err)}`,
        lastUpdated: nowIso(deps),
      },
    }
  }
}

async function loadDependencies(): Promise<StatusDependencies> {
  const { runOpenClawCommand } = await import('./_lib/openclaw')
  return {
    runOpenClawCommand,
    now: () => Date.now(),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<StatusResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
  }

  const deps = await loadDependencies()
  const result = await buildStatusResponse(req, deps)
  return res.status(result.statusCode).json(result.body)
}
