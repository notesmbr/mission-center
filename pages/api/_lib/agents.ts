export type AgentSession = {
  agentId: string
  key: string
  kind: string
  sessionId: string | null
  updatedAt: string
  age: number | null
  model: string | null
  percentUsed: number | null
  totalTokens: number | null
  remainingTokens: number | null
  abortedLastRun: boolean
  flags: string[]
}

export type AgentsListResponse =
  | {
      dataSource: 'openclaw_status_recent'
      available: true
      sessions: AgentSession[]
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_status_recent'
      available: false
      reason: string
      lastUpdated: string
    }

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return Math.floor(value)
    if (value > 1e9) return Math.floor(value * 1000)
    return null
  }

  if (typeof value === 'string' && value.trim()) {
    const directNum = asNumber(value)
    if (directNum !== null) {
      if (directNum > 1e12) return Math.floor(directNum)
      if (directNum > 1e9) return Math.floor(directNum * 1000)
    }

    const ts = Date.parse(value)
    return Number.isNaN(ts) ? null : ts
  }

  return null
}

function clampAgeMs(age: number | null): number | null {
  if (age === null || Number.isNaN(age)) return null
  return age < 0 ? 0 : Math.floor(age)
}

function normalizeFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 20)
}

export function sanitizeRecentSessions(recent: unknown, nowMs = Date.now()): AgentSession[] {
  if (!Array.isArray(recent)) return []

  const sessions = recent.map((raw: any) => {
    const updatedAtMs = parseTimestampMs(raw?.updatedAt)
    const rawAge = asNumber(raw?.age)
    const age = clampAgeMs(rawAge !== null ? rawAge : updatedAtMs !== null ? nowMs - updatedAtMs : null)
    const fallbackUpdatedAtMs = age !== null ? nowMs - age : nowMs

    return {
      agentId: String(raw?.agentId || 'unknown'),
      key: String(raw?.key || ''),
      kind: String(raw?.kind || 'unknown'),
      sessionId: raw?.sessionId ? String(raw.sessionId) : raw?.id ? String(raw.id) : null,
      updatedAt: new Date(updatedAtMs ?? fallbackUpdatedAtMs).toISOString(),
      age,
      model: raw?.model ? String(raw.model) : null,
      percentUsed: asNumber(raw?.percentUsed),
      totalTokens: asNumber(raw?.totalTokens),
      remainingTokens: asNumber(raw?.remainingTokens),
      abortedLastRun: Boolean(raw?.abortedLastRun),
      flags: normalizeFlags(raw?.flags),
    } satisfies AgentSession
  })

  sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return sessions
}

export function makeAgentsListSuccess(sessions: AgentSession[], now = new Date()): AgentsListResponse {
  return {
    dataSource: 'openclaw_status_recent',
    available: true,
    sessions,
    lastUpdated: now.toISOString(),
  }
}

export function makeAgentsListFailure(reason: string, now = new Date()): AgentsListResponse {
  return {
    dataSource: 'openclaw_status_recent',
    available: false,
    reason,
    lastUpdated: now.toISOString(),
  }
}
