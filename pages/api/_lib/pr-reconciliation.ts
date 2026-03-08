import { execFile } from 'child_process'
import fs from 'fs'

type ReconcileableTask = {
  id?: unknown
  status?: unknown
  note?: unknown
  repo?: unknown
  pr?: unknown
  updatedAt?: unknown
  completedAt?: unknown
}

type LivePrState = 'OPEN' | 'CLOSED' | 'MERGED'

export type LivePrSnapshot = {
  number: number
  state: LivePrState
  title?: string
  url?: string
  mergedAt?: string
  closedAt?: string
}

export type ReconcileTaskOptions = {
  taskIds?: string[]
  maxCandidates?: number
  now?: () => number
}

const GITHUB_REPO_URL_RE = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i
const GITHUB_REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const STALE_READY_NOTE_RE =
  /(ready to merge|ready for human review|done-gate|pr exists but done-gate|auto-created pr after task exit)/i

const GH_TIMEOUT_MS = 2_500
const MAX_RECONCILE_CANDIDATES = 20
const REPO_SLUG_CACHE_TTL_MS = 10 * 60_000
const PR_STATE_CACHE_TTL_MS = 60_000

const repoSlugCache = new Map<string, { expiresAt: number; value: string | null }>()
const prSnapshotCache = new Map<string, { expiresAt: number; value: LivePrSnapshot | null }>()

let ghAvailableMemo: boolean | undefined

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return undefined
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function runExecFile(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      if (stderr && stderr.trim()) {
        // gh frequently prints warnings to stderr; treat as non-fatal.
      }
      resolve(stdout || '')
    })
  })
}

async function isGhAvailable(): Promise<boolean> {
  if (ghAvailableMemo != null) return ghAvailableMemo
  try {
    await runExecFile('gh', ['--version'], 1_500)
    ghAvailableMemo = true
  } catch {
    ghAvailableMemo = false
  }
  return ghAvailableMemo
}

function normalizeLivePrState(state: unknown, mergedAt: unknown): LivePrState | undefined {
  if (asNonEmptyString(mergedAt)) return 'MERGED'
  const normalized = String(state || '')
    .trim()
    .toUpperCase()
  if (normalized === 'OPEN') return 'OPEN'
  if (normalized === 'CLOSED') return 'CLOSED'
  if (normalized === 'MERGED') return 'MERGED'
  return undefined
}

function parseTimestampMs(value: unknown): number | undefined {
  const text = asNonEmptyString(value)
  if (!text) return undefined
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return timestamp
}

function parseRepoSlug(value: string): string | null {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  if (GITHUB_REPO_SLUG_RE.test(trimmed)) return trimmed

  const urlMatch = trimmed.match(GITHUB_REPO_URL_RE)
  if (urlMatch?.[1] && urlMatch[2]) {
    return `${urlMatch[1]}/${urlMatch[2]}`
  }
  return null
}

async function resolveRepoSlug(repoValue: string | undefined): Promise<string | null> {
  const input = String(repoValue || '').trim()
  if (!input) return null

  const nowMs = Date.now()
  const cached = repoSlugCache.get(input)
  if (cached && cached.expiresAt > nowMs) {
    return cached.value
  }

  const direct = parseRepoSlug(input)
  if (direct) {
    repoSlugCache.set(input, { expiresAt: nowMs + REPO_SLUG_CACHE_TTL_MS, value: direct })
    return direct
  }

  if (!fs.existsSync(input)) {
    repoSlugCache.set(input, { expiresAt: nowMs + REPO_SLUG_CACHE_TTL_MS, value: null })
    return null
  }

  try {
    const stdout = await runExecFile('git', ['-C', input, 'remote', 'get-url', 'origin'], 2_000)
    const slug = parseRepoSlug(stdout.trim())
    repoSlugCache.set(input, { expiresAt: nowMs + REPO_SLUG_CACHE_TTL_MS, value: slug })
    return slug
  } catch {
    repoSlugCache.set(input, { expiresAt: nowMs + REPO_SLUG_CACHE_TTL_MS, value: null })
    return null
  }
}

async function fetchLivePrSnapshot(repoSlug: string, prNumber: number): Promise<LivePrSnapshot | null> {
  const key = `${repoSlug}#${prNumber}`
  const nowMs = Date.now()
  const cached = prSnapshotCache.get(key)
  if (cached && cached.expiresAt > nowMs) {
    return cached.value
  }

  try {
    const stdout = await runExecFile(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', repoSlug, '--json', 'number,state,title,url,mergedAt,closedAt'],
      GH_TIMEOUT_MS,
    )
    const parsed = JSON.parse(stdout || '{}') as Record<string, unknown>
    const number = asPositiveNumber(parsed.number)
    const state = normalizeLivePrState(parsed.state, parsed.mergedAt)
    if (!number || !state) {
      prSnapshotCache.set(key, { expiresAt: nowMs + PR_STATE_CACHE_TTL_MS, value: null })
      return null
    }
    const snapshot: LivePrSnapshot = {
      number,
      state,
      title: asNonEmptyString(parsed.title),
      url: asNonEmptyString(parsed.url),
      mergedAt: asNonEmptyString(parsed.mergedAt),
      closedAt: asNonEmptyString(parsed.closedAt),
    }
    prSnapshotCache.set(key, { expiresAt: nowMs + PR_STATE_CACHE_TTL_MS, value: snapshot })
    return snapshot
  } catch {
    prSnapshotCache.set(key, { expiresAt: nowMs + 15_000, value: null })
    return null
  }
}

function isStaleReadyNote(note: string | undefined): boolean {
  if (!note) return false
  return STALE_READY_NOTE_RE.test(note)
}

export function reconcileTaskWithLivePr(task: ReconcileableTask, snapshot: LivePrSnapshot, nowMs: number): ReconcileableTask {
  const currentPr = asObject(task.pr)
  const nextPr: Record<string, unknown> = {
    ...(currentPr || {}),
    number: snapshot.number,
    title: snapshot.title || currentPr?.title,
    url: snapshot.url || currentPr?.url,
    state: snapshot.state,
  }

  let changed = false
  if (!currentPr) changed = true
  if (currentPr?.state !== nextPr.state) changed = true
  if (snapshot.title && currentPr?.title !== snapshot.title) changed = true
  if (snapshot.url && currentPr?.url !== snapshot.url) changed = true

  const nextTask: ReconcileableTask = { ...task, pr: nextPr }
  const currentNote = asNonEmptyString(task.note)

  if (snapshot.state === 'MERGED') {
    if (nextTask.status !== 'done') {
      nextTask.status = 'done'
      changed = true
    }
    const mergedNote = snapshot.url ? `Merged: ${snapshot.url}` : `Merged PR #${snapshot.number}`
    if (currentNote !== mergedNote) {
      nextTask.note = mergedNote
      changed = true
    }
    if (typeof nextTask.completedAt !== 'number') {
      nextTask.completedAt = parseTimestampMs(snapshot.mergedAt) ?? nowMs
      changed = true
    }
  } else if (snapshot.state === 'CLOSED') {
    if (isStaleReadyNote(currentNote)) {
      const closedNote = snapshot.url ? `PR closed (not merged): ${snapshot.url}` : `PR closed (not merged): #${snapshot.number}`
      if (currentNote !== closedNote) {
        nextTask.note = closedNote
        changed = true
      }
    }
  }

  if (changed) {
    nextTask.updatedAt = nowMs
  }
  return changed ? nextTask : task
}

type Candidate = {
  index: number
  repoValue: string
  prNumber: number
}

export function shouldConsiderTask(task: ReconcileableTask, selectedTaskIds?: Set<string>): boolean {
  const taskId = asNonEmptyString(task.id)
  if (selectedTaskIds) {
    return Boolean(taskId && selectedTaskIds.has(taskId))
  }

  const status = String(task.status || '')
    .trim()
    .toLowerCase()
  if (!['done', 'needs_attention', 'closed', 'merged'].includes(status)) {
    return false
  }

  const pr = asObject(task.pr)
  const prState = String(pr?.state || '')
    .trim()
    .toUpperCase()

  return prState === 'OPEN' || isStaleReadyNote(asNonEmptyString(task.note))
}

export async function reconcileTasksWithLivePrState<T extends ReconcileableTask>(
  tasks: T[],
  options: ReconcileTaskOptions = {},
): Promise<T[]> {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks
  if (!(await isGhAvailable())) return tasks

  const selectedTaskIds = Array.isArray(options.taskIds) ? new Set(options.taskIds.filter(Boolean)) : undefined
  const maxCandidates = Math.max(1, options.maxCandidates || MAX_RECONCILE_CANDIDATES)
  const now = options.now || Date.now

  const candidates: Candidate[] = []
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index]
    if (!shouldConsiderTask(task, selectedTaskIds)) continue

    const pr = asObject(task.pr)
    const prNumber = asPositiveNumber(pr?.number)
    const repoValue = asNonEmptyString(task.repo)
    if (!prNumber || !repoValue) continue

    candidates.push({ index, prNumber, repoValue })
    if (candidates.length >= maxCandidates) break
  }

  if (!candidates.length) return tasks

  const out = [...tasks]
  const repoSlugByInput = new Map<string, Promise<string | null>>()
  const nowMs = now()

  function getRepoSlug(repoValue: string): Promise<string | null> {
    let memoized = repoSlugByInput.get(repoValue)
    if (!memoized) {
      memoized = resolveRepoSlug(repoValue)
      repoSlugByInput.set(repoValue, memoized)
    }
    return memoized
  }

  const updates = await Promise.all(
    candidates.map(async (candidate) => {
      const repoSlug = await getRepoSlug(candidate.repoValue)
      if (!repoSlug) return null

      const snapshot = await fetchLivePrSnapshot(repoSlug, candidate.prNumber)
      if (!snapshot) return null

      const currentTask = out[candidate.index]
      const nextTask = reconcileTaskWithLivePr(currentTask, snapshot, nowMs) as T
      if (nextTask === currentTask) return null
      return { index: candidate.index, task: nextTask }
    }),
  )

  for (const update of updates) {
    if (!update) continue
    out[update.index] = update.task
  }

  return out
}

export default {
  reconcileTaskWithLivePr,
  reconcileTasksWithLivePrState,
  shouldConsiderTask,
}
