import type { NextApiRequest, NextApiResponse } from 'next'

const OPENCLAW_CONFIG_PATH = '/Users/notesmbr/.openclaw/openclaw.json'
const MAINTENANCE_LOG_PATH = '/Users/notesmbr/.openclaw/workspace/scripts/logs/maintenance.log'
const TRADER_LOG_PATH = '/Users/notesmbr/.openclaw/workspace/trader.log'

export type AlertSeverity = 'error' | 'warn'

type Alert = {
  id: string
  severity: AlertSeverity
  title: string
  detail: string
  source: string
  project?: string
  ts: string
  meta?: any
}

type AlertsResponse =
  | {
      dataSource: 'derived'
      available: true
      alerts: Alert[]
      lastUpdated: string
    }
  | {
      dataSource: 'derived'
      available: false
      reason: string
      lastUpdated: string
    }

function nowIso() {
  return new Date().toISOString()
}

function parseProjectTag(name: string | undefined): string | undefined {
  if (!name) return undefined
  const m = name.match(/^\[project:([^\]]+)\]\s+/)
  return m?.[1]
}

function tailLines(text: string, maxLines: number) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const tail = lines.slice(-maxLines)
  return { tail, lineCount: lines.length }
}

function findLogWarnings(tail: string[]): string[] {
  const warnings: string[] = []
  for (const line of tail) {
    if (/\bWARNING\b/i.test(line) || /\bERROR\b/i.test(line) || /Exception/i.test(line)) {
      warnings.push(line)
    }
  }
  return warnings.slice(-20)
}

function requiredModelKeysFromConfig(cfg: any): string[] {
  const keys = new Set<string>()
  const add = (k: any) => {
    if (typeof k === 'string' && k.trim()) keys.add(k)
  }

  add(cfg?.agents?.defaults?.model?.primary)
  for (const fb of cfg?.agents?.defaults?.model?.fallbacks || []) add(fb)

  add(cfg?.agents?.defaults?.heartbeat?.model)

  const sub = cfg?.agents?.defaults?.subagents?.model
  if (typeof sub === 'string') add(sub)
  else {
    add(sub?.primary)
    for (const fb of sub?.fallbacks || []) add(fb)
  }

  return [...keys]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<AlertsResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const { execFile } = await import('child_process')
    const fs = await import('fs')

    const alerts: Alert[] = []

    const { runOpenClawCommand } = await import('./_lib/openclaw')

    // 1) Cron job health
    const cronOut: string = await runOpenClawCommand(['cron', 'list', '--json'], 8000)
    const cron = JSON.parse(cronOut)
    const jobs: any[] = cron?.jobs || []

    for (const job of jobs) {
      const state = job?.state || {}
      const lastRunStatus = state?.lastRunStatus
      const consecutiveErrors = state?.consecutiveErrors || 0
      const lastError = state?.lastError
      const project = parseProjectTag(job?.name)

      if (lastRunStatus === 'error' || consecutiveErrors > 0) {
        alerts.push({
          id: `cron:${job.id}`,
          severity: 'error',
          title: `${job?.name || 'Cron job'} failed`,
          detail: lastError || `lastRunStatus=${lastRunStatus}, consecutiveErrors=${consecutiveErrors}`,
          source: 'openclaw cron list --json',
          project,
          ts: nowIso(),
          meta: { jobId: job.id, lastRunAtMs: state?.lastRunAtMs, nextRunAtMs: state?.nextRunAtMs },
        })
      }
    }

    // 2) Models required by config must be available
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'))
      const required = requiredModelKeysFromConfig(cfg)

      const modelsOut: string = await runOpenClawCommand(['models', 'list', '--json'], 8000)
      const models = JSON.parse(modelsOut)
      const list: any[] = models?.models || []
      const byKey = new Map<string, any>(list.map((m) => [m.key, m]))

      for (const key of required) {
        const m = byKey.get(key)
        if (!m) {
          alerts.push({
            id: `model:missing:${key}`,
            severity: 'error',
            title: `Required model not found: ${key}`,
            detail: `Model is referenced by openclaw.json but not present in openclaw models list.`,
            source: 'openclaw.json + openclaw models list --json',
            ts: nowIso(),
          })
          continue
        }
        if (m.available === false || m.missing === true) {
          alerts.push({
            id: `model:unavailable:${key}`,
            severity: 'error',
            title: `Required model unavailable: ${key}`,
            detail: `available=${m.available} missing=${m.missing} tags=${(m.tags || []).join(',')}`,
            source: 'openclaw models list --json',
            ts: nowIso(),
          })
        }
      }
    }

    // 3) Maintenance log warnings/errors
    if (fs.existsSync(MAINTENANCE_LOG_PATH)) {
      const text = fs.readFileSync(MAINTENANCE_LOG_PATH, 'utf-8')
      const { tail } = tailLines(text, 200)
      const hits = findLogWarnings(tail)
      if (hits.length) {
        alerts.push({
          id: 'log:maintenance',
          severity: 'warn',
          title: 'Nightly maintenance warnings/errors detected',
          detail: hits.slice(-6).join('\n'),
          source: MAINTENANCE_LOG_PATH,
          project: 'ops',
          ts: nowIso(),
        })
      }
    }

    // 4) Trader log errors
    if (fs.existsSync(TRADER_LOG_PATH)) {
      const text = fs.readFileSync(TRADER_LOG_PATH, 'utf-8')
      const { tail } = tailLines(text, 200)
      const hits = [] as string[]
      for (const line of tail) {
        if (/\bERROR\b/i.test(line) || /Exception/i.test(line)) hits.push(line)
      }
      if (hits.length) {
        alerts.push({
          id: 'log:trader',
          severity: 'warn',
          title: 'Trader warnings/errors detected',
          detail: hits.slice(-6).join('\n'),
          source: TRADER_LOG_PATH,
          project: 'crypto',
          ts: nowIso(),
        })
      }
    }

    // Sort: errors first
    alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))

    return res.status(200).json({
      dataSource: 'derived',
      available: true,
      alerts,
      lastUpdated: nowIso(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'derived',
      available: false,
      reason: `Failed to build alerts: ${err?.message || String(err)}`,
      lastUpdated: nowIso(),
    })
  }
}
