import type { NextApiRequest, NextApiResponse } from 'next'

type TasksListResponse =
  | {
      dataSource: 'clawdbot_active_tasks'
      available: true
      tasks: any[]
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

// Best-effort throttle to avoid running orchestrator check too frequently.
let lastSyncAtMs = 0

export default async function handler(req: NextApiRequest, res: NextApiResponse<TasksListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  const wantSync = String(req.query.sync || '') === '1'
  const minSyncIntervalMs = 60_000

  try {
    const { readActiveTasks, readClawdbotConfig, runOrchestratorCommand } = await import('../_lib/clawdbot')

    let syncAttempted = false
    let syncThrottled = false

    if (wantSync) {
      const now = Date.now()
      if (now - lastSyncAtMs < minSyncIntervalMs) {
        syncThrottled = true
      } else {
        syncAttempted = true
        lastSyncAtMs = now
        try {
          // Updates task statuses based on tmux + PR/CI checks.
          await runOrchestratorCommand(['check'], 25000)
        } catch (_err) {
          // Non-fatal: fall back to last known active-tasks.json
        }
      }
    }

    const { tasks } = readActiveTasks()
    const { projects } = readClawdbotConfig()

    return res.status(200).json({
      dataSource: 'clawdbot_active_tasks',
      available: true,
      tasks,
      projects: (projects || []).map((p: any) => ({ id: p.id, name: p.name, enabled: p.enabled !== false })),
      syncAttempted,
      syncThrottled,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'clawdbot_active_tasks',
      available: false,
      reason: `Failed to load clawdbot tasks: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
