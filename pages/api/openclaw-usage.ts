import type { NextApiRequest, NextApiResponse } from 'next'

// Read-only endpoint: estimates OpenClaw/OpenAI-Codex OAuth usage windows from local gateway logs.
// On Railway these logs won't exist; we return "unavailable".

const LOG_MAIN = '/Users/notesmbr/.openclaw/logs/gateway.log'
const LOG_ERR = '/Users/notesmbr/.openclaw/logs/gateway.err.log'

type UsageResponse =
  | {
      dataSource: 'local_logs'
      available: true
      window5h: {
        start: string
        end: string
        requestCountApprox: number
        models: Record<string, number>
      }
      window7d: {
        start: string
        end: string
        requestCountApprox: number
        models: Record<string, number>
      }
      alerts: Array<{
        level: 'info' | 'warn' | 'critical'
        code: string
        message: string
        evidence?: string
      }>
      notes: string[]
      lastUpdated: string
    }
  | {
      dataSource: 'local_logs'
      available: false
      reason: string
      lastUpdated: string
    }

function iso(ts: number) {
  return new Date(ts).toISOString()
}

function parseTs(line: string): number | null {
  // Most lines are ISO-8601 at start: 2026-02-25T15:13:49.130Z ...
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)
  if (m) {
    const t = Date.parse(m[1])
    return Number.isFinite(t) ? t : null
  }
  return null
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UsageResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const fs = await import('fs')
    const exists = fs.existsSync(LOG_MAIN) || fs.existsSync(LOG_ERR)
    if (!exists) {
      return res.status(200).json({
        dataSource: 'local_logs',
        available: false,
        reason: 'Gateway log files not found on this host (expected when running on Railway).',
        lastUpdated: new Date().toISOString(),
      })
    }

    const now = Date.now()
    const start5h = now - 5 * 60 * 60 * 1000
    const start7d = now - 7 * 24 * 60 * 60 * 1000

    const models5h: Record<string, number> = {}
    const models7d: Record<string, number> = {}
    let req5h = 0
    let req7d = 0

    // Heuristic: count model uses from lines that include "agent model:" or other model markers.
    // This is imperfect but good enough for a conservative alerting system.
    const modelPat = /(openai-codex\/[^\s"']+)/g
    const limitPat = /(rate[_ -]?limit|usage limit|quota|weekly|\b5h\b)/i

    const alerts: UsageResponse extends { available: true } ? any : any[] = []
    let lastLimitEvidence: string | null = null

    function scanFile(path: string) {
      if (!fs.existsSync(path)) return
      const text = fs.readFileSync(path, 'utf-8')
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        if (!line) continue
        const ts = parseTs(line)
        if (ts === null) continue

        const matches = [...line.matchAll(modelPat)].map((m) => m[1])
        if (!matches.length) continue

        if (ts >= start7d) {
          req7d += 1
          for (const model of matches) inc(models7d, model)
        }
        if (ts >= start5h) {
          req5h += 1
          for (const model of matches) inc(models5h, model)
        }

        // capture any explicit limit-ish evidence for alert surfacing
        if (limitPat.test(line)) {
          lastLimitEvidence = line.slice(0, 300)
        }
      }
    }

    scanFile(LOG_MAIN)
    scanFile(LOG_ERR)

    // Conservative alerting: compare to the *low end* of known Pro ranges.
    // These are ranges; we'll warn based on the minimums to avoid surprises.
    const PRO_MIN_LOCAL_5H = 300
    const PRO_MIN_CLOUD_5H = 50
    // We do not know local vs cloud split from logs; treat all as local messages for worst-case.
    const minBudget5h = PRO_MIN_LOCAL_5H

    const notes: string[] = [
      'Estimates are derived from local gateway logs. This is not an official OpenAI quota API.',
      '5-hour Codex limits are shared between local messages and cloud tasks; we cannot reliably separate them from these logs.',
      'Weekly limits are not clearly published; we track 7-day activity + explicit limit signals when they appear.',
    ]

    if (lastLimitEvidence) {
      alerts.push({
        level: 'critical',
        code: 'LIMIT_SIGNAL',
        message: 'Detected limit/rate-limit language in logs. Treat as close-to-limit until it clears.',
        evidence: lastLimitEvidence,
      })
    }

    const pct5h = minBudget5h > 0 ? (req5h / minBudget5h) * 100 : 0
    if (pct5h >= 95) {
      alerts.push({
        level: 'critical',
        code: 'WINDOW5H_NEAR_LIMIT',
        message: `Estimated 5h usage is ~${pct5h.toFixed(0)}% of conservative minimum (${minBudget5h}/5h).`,
      })
    } else if (pct5h >= 80) {
      alerts.push({
        level: 'warn',
        code: 'WINDOW5H_HIGH',
        message: `Estimated 5h usage is ~${pct5h.toFixed(0)}% of conservative minimum (${minBudget5h}/5h).`,
      })
    } else {
      alerts.push({
        level: 'info',
        code: 'WINDOW5H_OK',
        message: `Estimated 5h usage is ~${pct5h.toFixed(0)}% of conservative minimum (${minBudget5h}/5h).`,
      })
    }

    return res.status(200).json({
      dataSource: 'local_logs',
      available: true,
      window5h: {
        start: iso(start5h),
        end: iso(now),
        requestCountApprox: req5h,
        models: models5h,
      },
      window7d: {
        start: iso(start7d),
        end: iso(now),
        requestCountApprox: req7d,
        models: models7d,
      },
      alerts,
      notes,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'local_logs',
      available: false,
      reason: `Failed to analyze logs: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
