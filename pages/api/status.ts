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

export default async function handler(req: NextApiRequest, res: NextApiResponse<StatusResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const { runOpenClawCommand } = await import('./_lib/openclaw')

    const out: string = await runOpenClawCommand(['status', '--json'], 5000)

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

    return res.status(200).json({
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
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'openclaw_status_json',
      available: false,
      reason: `Failed to run openclaw status --json: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
