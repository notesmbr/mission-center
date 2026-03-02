import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Sidebar, { type NavKey } from '../components/Sidebar'

// --- Types (kept intentionally minimal; backend is trusted local-only) ---

type StatusData =
  | {
      dataSource: 'openclaw_status_json'
      available: true
      openclaw: {
        reachable: true
        heartbeatEvery?: string
        sessionCount?: number
        defaultModel?: string
      }
      sessions: Array<{ agentId: string; key: string; kind: string; age: number; model?: string }>
      lastUpdated: string
    }
  | { dataSource: 'openclaw_status_json'; available: false; reason: string; lastUpdated: string }

type AgentSession = {
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

type AgentsListData =
  | { dataSource: 'openclaw_status_recent'; available: true; sessions: AgentSession[]; lastUpdated: string }
  | { dataSource: 'openclaw_status_recent'; available: false; reason: string; lastUpdated: string }

type SwarmTask = {
  id: string
  projectId?: string
  description?: string
  agent?: string
  status: 'queued' | 'running' | 'needs_attention' | 'done' | 'failed' | 'unknown' | string
  attempts?: number
  maxAttempts?: number
  updatedAt?: number
  createdAt?: number
  branch?: string
  tmuxSession?: string
  worktree?: string
  note?: string
}

type SwarmStatusData =
  | {
      dataSource: 'clawdbot_swarm_status'
      available: true
      summary: {
        total: number
        queued: number
        running: number
        needs_attention: number
        done: number
        failed: number
      }
      tasks: SwarmTask[]
      projects: Array<{ id: string; name?: string; enabled?: boolean }>
      filters: {
        projectIds: string[]
        agents: string[]
        statuses: string[]
      }
      lastUpdated: string
    }
  | { dataSource: 'clawdbot_swarm_status'; available: false; reason: string; lastUpdated: string }

type SwarmTaskDetailsData =
  | {
      dataSource: 'clawdbot_swarm_task_details'
      available: true
      task: SwarmTask
      tmuxAttachCommand: string | null
      log: { available: true; path: string; tail: string; lineCount: number } | { available: false; reason: string }
      lastUpdated: string
    }
  | { dataSource: 'clawdbot_swarm_task_details'; available: false; reason: string; lastUpdated: string }

type CronListData =
  | { dataSource: 'openclaw_cron_list'; available: true; jobs: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_list'; available: false; reason: string; lastUpdated: string }

type CronRunsData =
  | { dataSource: 'openclaw_cron_runs'; available: true; entries: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_runs'; available: false; reason: string; lastUpdated: string }



type ProjectDoc = { kind: 'repo' | 'vault'; path: string; title: string | null; excerpt: string; updatedAtMs: number | null }

type ProjectSummary = {
  id: string
  name?: string
  enabled?: boolean
  repoRelative?: string
  summary: { total: number; queued: number; running: number; needs_attention: number; done: number; failed: number; unknown: number }
  tasks: any[]
  docs: ProjectDoc[]
}

type ProjectsSummaryData =
  | { dataSource: 'clawdbot_projects_summary'; available: true; projects: ProjectSummary[]; lastUpdated: string }
  | { dataSource: 'clawdbot_projects_summary'; available: false; reason: string; lastUpdated: string }

type AnyJson = any

function msToRelative(ms?: number): string {
  if (!ms) return 'n/a'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function msToHuman(ms?: number): string {
  if (!ms) return 'n/a'
  return `${new Date(ms).toLocaleString()} (${msToRelative(ms)})`
}

function taskStatusClass(status?: string): string {
  if (status === 'running') return 'bg-blue-900/60 text-blue-200 border-blue-800'
  if (status === 'queued') return 'bg-slate-700/60 text-slate-200 border-slate-600'
  if (status === 'needs_attention') return 'bg-rose-900/60 text-rose-200 border-rose-800'
  if (status === 'done') return 'bg-emerald-900/60 text-emerald-200 border-emerald-800'
  if (status === 'failed') return 'bg-red-900/60 text-red-200 border-red-800'
  return 'bg-slate-800 text-slate-200 border-slate-600'
}

function scheduleLabel(job: any): string {
  const sch = job?.schedule
  if (!sch) return 'n/a'
  if (sch.kind === 'every') {
    const ms = sch.everyMs || 0
    const mins = Math.round(ms / 60000)
    if (!mins) return 'every ?'
    if (mins < 60) return `every ${mins}m`
    const hrs = Math.round(mins / 60)
    return `every ${hrs}h`
  }
  if (sch.kind === 'cron') return `cron ${sch.expr || '?'}${sch.tz ? ` @ ${sch.tz}` : ''}`
  if (sch.kind === 'at') return `at ${sch.at}`
  return sch.kind
}

function groupBy<T>(items: T[], keyFn: (t: T) => string): Array<{ key: string; items: T[] }> {
  const m = new Map<string, T[]>()
  for (const item of items) {
    const k = keyFn(item)
    const list = m.get(k)
    if (list) list.push(item)
    else m.set(k, [item])
  }
  return Array.from(m.entries())
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavKey>('overview')

  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)

  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [agentsData, setAgentsData] = useState<AgentsListData | null>(null)
  const [swarmData, setSwarmData] = useState<SwarmStatusData | null>(null)
  const [cronData, setCronData] = useState<CronListData | null>(null)
  const [projectsData, setProjectsData] = useState<ProjectsSummaryData | null>(null)

  const [loading, setLoading] = useState(true)

  const [taskViewMode, setTaskViewMode] = useState<'board' | 'table'>('board')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskAgentFilter, setTaskAgentFilter] = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')

  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [taskDetails, setTaskDetails] = useState<SwarmTaskDetailsData | null>(null)
  const [taskDetailsLoading, setTaskDetailsLoading] = useState(false)

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [cronRuns, setCronRuns] = useState<CronRunsData | null>(null)

  const [copiedText, setCopiedText] = useState<string>('')

  const safeFetchJson = async (url: string): Promise<AnyJson> => {
    const response = await fetch(url)
    return response.json()
  }

  const refreshAll = async () => {
    try {
      const results = await Promise.allSettled([
        safeFetchJson('/api/status'),
        safeFetchJson('/api/agents/list'),
        safeFetchJson('/api/swarm/status'),
        safeFetchJson('/api/cron/list'),
        safeFetchJson('/api/projects/summary'),
      ])

      const [statusRes, agentsRes, swarmRes, cronRes, projectsRes] = results

      if (statusRes.status === 'fulfilled') setStatusData(statusRes.value)
      if (agentsRes.status === 'fulfilled') setAgentsData(agentsRes.value)
      if (swarmRes.status === 'fulfilled') setSwarmData(swarmRes.value)
      if (cronRes.status === 'fulfilled') setCronData(cronRes.value)
      if (projectsRes.status === 'fulfilled') setProjectsData(projectsRes.value)

      setLastRefreshedAt(Date.now())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
    const interval = setInterval(refreshAll, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedJobId) return

    const fetchRuns = async () => {
      try {
        const res = await fetch(`/api/cron/runs?id=${encodeURIComponent(selectedJobId)}`)
        setCronRuns(await res.json())
      } catch {
        setCronRuns({ dataSource: 'openclaw_cron_runs', available: false, reason: 'Failed to load runs.', lastUpdated: new Date().toISOString() })
      }
    }

    fetchRuns()
    const interval = setInterval(fetchRuns, 15000)
    return () => clearInterval(interval)
  }, [selectedJobId])

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetails(null)
      setTaskDetailsLoading(false)
      return
    }

    let cancelled = false

    const fetchDetails = async () => {
      setTaskDetailsLoading(true)
      try {
        const response = await fetch(`/api/swarm/task-details?id=${encodeURIComponent(selectedTaskId)}`)
        const data = await response.json()
        if (!cancelled) setTaskDetails(data)
      } catch {
        if (!cancelled) {
          setTaskDetails({
            dataSource: 'clawdbot_swarm_task_details',
            available: false,
            reason: 'Failed to load task details.',
            lastUpdated: new Date().toISOString(),
          })
        }
      } finally {
        if (!cancelled) setTaskDetailsLoading(false)
      }
    }

    fetchDetails()
    const interval = setInterval(fetchDetails, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selectedTaskId])

  const projectOptions = useMemo(() => {
    const set = new Set<string>()
    if (swarmData && swarmData.available) {
      for (const p of swarmData.filters.projectIds) set.add(p)
    }
    return ['all', ...Array.from(set).sort()]
  }, [swarmData])

  useEffect(() => {
    if (selectedProject === 'all') return
    if (!projectOptions.includes(selectedProject)) setSelectedProject('all')
  }, [projectOptions, selectedProject])

  const allTasks = useMemo(() => {
    if (!swarmData || !swarmData.available) return [] as SwarmTask[]
    return swarmData.tasks || []
  }, [swarmData])

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()

    return allTasks.filter((t) => {
      const pid = t.projectId || 'unassigned'
      const agent = t.agent || 'unknown'
      const status = t.status || 'unknown'

      if (selectedProject !== 'all' && pid !== selectedProject) return false
      if (taskAgentFilter !== 'all' && agent !== taskAgentFilter) return false
      if (taskStatusFilter !== 'all' && status !== taskStatusFilter) return false

      if (!q) return true
      return t.id.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    })
  }, [allTasks, selectedProject, taskSearch, taskAgentFilter, taskStatusFilter])

  const taskAgentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of allTasks) if (t.agent) set.add(t.agent)
    return ['all', ...Array.from(set).sort()]
  }, [allTasks])

  const taskSummary = useMemo(() => {
    let queued = 0,
      running = 0,
      needs_attention = 0,
      done = 0,
      failed = 0

    for (const t of filteredTasks) {
      if (t.status === 'queued') queued += 1
      else if (t.status === 'running') running += 1
      else if (t.status === 'needs_attention') needs_attention += 1
      else if (t.status === 'done') done += 1
      else if (t.status === 'failed') failed += 1
    }

    return { total: filteredTasks.length, queued, running, needs_attention, done, failed }
  }, [filteredTasks])

  const taskBuckets = useMemo(() => {
    const buckets: Record<string, SwarmTask[]> = {
      queued: [],
      running: [],
      needs_attention: [],
      done: [],
      failed: [],
      unknown: [],
    }

    for (const t of filteredTasks) {
      const s = String(t.status || 'unknown')
      if (!buckets[s]) buckets.unknown.push(t)
      else buckets[s].push(t)
    }

    const sortByUpdated = (a: SwarmTask, b: SwarmTask) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    for (const k of Object.keys(buckets)) buckets[k].sort(sortByUpdated)

    return buckets
  }, [filteredTasks])

  const openclawSummary = useMemo(() => {
    if (!statusData || !statusData.available) return null
    return {
      reachable: statusData.openclaw.reachable,
      sessionCount: statusData.openclaw.sessionCount || statusData.sessions.length,
      heartbeatEvery: statusData.openclaw.heartbeatEvery || 'n/a',
      defaultModel: statusData.openclaw.defaultModel || 'unknown',
    }
  }, [statusData])

  const groupedAgentSessions = useMemo(() => {
    if (!agentsData || !agentsData.available) return [] as Array<{ agentId: string; sessions: AgentSession[] }>
    const groups = groupBy(agentsData.sessions || [], (s) => s.agentId || 'unknown')
    for (const g of groups) {
      g.items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    }
    return groups.map((g) => ({ agentId: g.key, sessions: g.items }))
  }, [agentsData])

  const activeAgentSessions = useMemo(() => {
    if (!agentsData || !agentsData.available) return [] as AgentSession[]
    // heuristic: "active" if updated in last 5 minutes
    const now = Date.now()
    return (agentsData.sessions || []).filter((s) => {
      const ts = Date.parse(s.updatedAt)
      if (!ts || Number.isNaN(ts)) return false
      return now - ts < 5 * 60 * 1000
    })
  }, [agentsData])

  const filteredJobs = useMemo(() => {
    const jobs = cronData && cronData.available ? cronData.jobs : []
    if (selectedProject === 'all') return jobs
    // project tag: [project:<id>] ...
    const re = new RegExp(`^\\[project:${selectedProject.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\]\\s+`)
    return jobs.filter((j: any) => re.test(String(j?.name || '')))
  }, [cronData, selectedProject])

  const jobBuckets = useMemo(() => {
    const needs: any[] = []
    const completed: any[] = []
    const scheduled: any[] = []
    const disabled: any[] = []

    for (const job of filteredJobs) {
      if (!job?.enabled) {
        disabled.push(job)
        continue
      }
      const state = job?.state || {}
      const lastRunStatus = state?.lastRunStatus
      const consecutiveErrors = state?.consecutiveErrors || 0
      const lastRunAtMs = state?.lastRunAtMs

      if (lastRunStatus === 'error' || consecutiveErrors > 0) {
        needs.push(job)
      } else if (lastRunStatus === 'ok' && lastRunAtMs && Date.now() - lastRunAtMs < 1000 * 60 * 60 * 12) {
        completed.push(job)
      } else {
        scheduled.push(job)
      }
    }

    return { needs, completed, scheduled, disabled }
  }, [filteredJobs])

  const copyText = async (text: string) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      setTimeout(() => setCopiedText(''), 1200)
    } catch {
      // ignore
    }
  }

  const OverviewView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-white text-lg font-semibold">Overview</div>
        <div className="text-slate-500 text-xs">auto-refreshes every 10s • last {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : 'n/a'}</div>
      </div>

      {!statusData ? (
        <div className="card">
          <div className="text-white font-semibold">OpenClaw status unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : statusData.available ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-slate-400 text-sm">OpenClaw Gateway</div>
            <div className="text-2xl font-bold text-green-400 mt-2">{openclawSummary?.reachable ? 'Online' : 'Offline'}</div>
            <div className="text-slate-500 text-xs mt-2">Heartbeat: {openclawSummary?.heartbeatEvery}</div>
          </div>
          <div className="card">
            <div className="text-slate-400 text-sm">Active Sessions</div>
            <div className="text-2xl font-bold mt-2">{openclawSummary?.sessionCount || 0}</div>
            <div className="text-slate-500 text-xs mt-2">Default model: {openclawSummary?.defaultModel || 'unknown'}</div>
          </div>
          <div className="card">
            <div className="text-slate-400 text-sm">Tasks</div>
            <div className="text-2xl font-bold mt-2">{swarmData && swarmData.available ? swarmData.summary.total : 'n/a'}</div>
            <div className="text-slate-500 text-xs mt-2">running: {swarmData && swarmData.available ? swarmData.summary.running : 'n/a'} • needs_attention: {swarmData && swarmData.available ? swarmData.summary.needs_attention : 'n/a'}</div>
          </div>
          <div className="card">
            <div className="text-slate-400 text-sm">Agents active (5m)</div>
            <div className="text-2xl font-bold mt-2">{activeAgentSessions.length}</div>
            <div className="text-slate-500 text-xs mt-2">recently updated sessions</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="text-white font-semibold">OpenClaw unreachable</div>
          <div className="text-slate-400 text-sm mt-1">{statusData.reason}</div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-white font-semibold">Quick links</div>
          <div className="mt-3 space-y-2 text-sm">
            <a href="https://mbrs-mac-mini.tail9b718b.ts.net/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline block">
              OpenClaw Control UI
            </a>
            <a href="http://mbrs-mac-mini.tail9b718b.ts.net:3000/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline block">
              Mission Center (this dashboard)
            </a>
          </div>
        </div>

        <div className="card">
          <div className="text-white font-semibold">Active agents (last 5m)</div>
          {!agentsData ? (
            <div className="text-slate-400 text-sm mt-2">No payload yet.</div>
          ) : !agentsData.available ? (
            <div className="text-slate-400 text-sm mt-2">{agentsData.reason}</div>
          ) : activeAgentSessions.length === 0 ? (
            <div className="text-slate-400 text-sm mt-2">No recently updated agent sessions.</div>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              {activeAgentSessions
                .slice(0, 8)
                .map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-100 truncate">{s.agentId} • {s.kind}</div>
                      <div className="text-slate-500 text-xs truncate">{s.model || 'model?'} • updated {new Date(s.updatedAt).toLocaleTimeString()}</div>
                    </div>
                    <button
                      onClick={() => copyText(s.key)}
                      className="text-xs px-2 py-1 border border-slate-600 rounded text-slate-200 hover:bg-slate-800"
                    >
                      Copy key
                    </button>
                  </div>
                ))}
              {copiedText && <div className="text-slate-500 text-xs">Copied.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )



  const ProjectsView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white text-lg font-semibold">Projects</div>
          <div className="text-slate-500 text-xs">Big-picture context + current work by project</div>
        </div>
        <div className="text-slate-500 text-xs">auto-refreshes every 10s</div>
      </div>

      {!projectsData ? (
        <div className="card">
          <div className="text-white font-semibold">Projects unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : !projectsData.available ? (
        <div className="card">
          <div className="text-white font-semibold">Projects unavailable</div>
          <div className="text-slate-400 text-sm mt-1">{projectsData.reason}</div>
        </div>
      ) : projectsData.projects.length === 0 ? (
        <div className="card">
          <div className="text-white font-semibold">No projects configured</div>
          <div className="text-slate-400 text-sm mt-1">Add projects in .clawdbot/config.json.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {projectsData.projects
            .filter((p) => selectedProject === 'all' || p.id === selectedProject)
            .map((p) => {
              const tasks = (p.tasks || []) as any[]
              const needs = tasks.filter((t) => t.status === 'needs_attention' || t.status === 'failed')
              const running = tasks.filter((t) => t.status === 'running')

              return (
                <div key={p.id} className="card">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white text-lg font-semibold truncate">{p.name || p.id}</div>
                      <div className="text-slate-500 text-xs mt-1 truncate">projectId: {p.id}{p.repoRelative ? ` • repo: ${p.repoRelative}` : ''}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2">
                        <div className="text-slate-500 text-[11px]">running</div>
                        <div className="text-slate-100 font-semibold">{p.summary.running}</div>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2">
                        <div className="text-slate-500 text-[11px]">needs attention</div>
                        <div className="text-rose-200 font-semibold">{p.summary.needs_attention + p.summary.failed}</div>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2">
                        <div className="text-slate-500 text-[11px]">total</div>
                        <div className="text-slate-100 font-semibold">{p.summary.total}</div>
                      </div>
                    </div>
                  </div>

                  {(running.length > 0 || needs.length > 0) && (
                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <div className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                        <div className="text-white font-semibold">Running</div>
                        {running.length === 0 ? (
                          <div className="text-slate-400 text-sm mt-2">None</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {running.slice(0, 6).map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  setActiveTab('tasks')
                                  setSelectedProject(p.id)
                                  setSelectedTaskId(t.id)
                                }}
                                className="w-full text-left bg-slate-950/40 border border-slate-700 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-500 text-xs mt-1">{t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                        <div className="text-white font-semibold">Needs attention</div>
                        {needs.length === 0 ? (
                          <div className="text-slate-400 text-sm mt-2">None</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {needs.slice(0, 6).map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  setActiveTab('tasks')
                                  setSelectedProject(p.id)
                                  setSelectedTaskId(t.id)
                                }}
                                className="w-full text-left bg-slate-950/40 border border-slate-700 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-500 text-xs mt-1">{t.status} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                                {t.note && <div className="text-slate-400 text-xs mt-2 truncate">{t.note}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-white font-semibold">Project context</div>
                    <div className="text-slate-500 text-xs mt-1">Pulled from README/AppStoreAssets and (optionally) .clawdbot/projects vault files.</div>

                    {p.docs.length === 0 ? (
                      <div className="text-slate-400 text-sm mt-2">No context docs found yet.</div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {p.docs.slice(0, 6).map((d) => (
                          <details key={d.path} className="bg-slate-950/30 border border-slate-700 rounded-lg p-3">
                            <summary className="cursor-pointer text-slate-100 text-sm font-medium">
                              {d.title || d.path} <span className="text-slate-500 text-xs">({d.kind})</span>
                            </summary>
                            <div className="text-slate-500 text-xs mt-2">{d.path}{d.updatedAtMs ? ` • updated ${msToHuman(d.updatedAtMs)}` : ''}</div>
                            <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap">{d.excerpt}</pre>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
  const TasksView = () => (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-white text-lg font-semibold">Tasks</div>
          <div className="text-slate-500 text-xs">Swarm tasks from .clawdbot • click a task for details</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTaskViewMode('board')}
            className={
              'text-xs px-3 py-2 border rounded-lg ' +
              (taskViewMode === 'board' ? 'border-slate-500 bg-slate-800 text-white' : 'border-slate-700 text-slate-200 hover:bg-slate-900')
            }
          >
            Board
          </button>
          <button
            onClick={() => setTaskViewMode('table')}
            className={
              'text-xs px-3 py-2 border rounded-lg ' +
              (taskViewMode === 'table' ? 'border-slate-500 bg-slate-800 text-white' : 'border-slate-700 text-slate-200 hover:bg-slate-900')
            }
          >
            Table
          </button>
        </div>
      </div>

      {!swarmData ? (
        <div className="card">
          <div className="text-white font-semibold">Tasks unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : !swarmData.available ? (
        <div className="card">
          <div className="text-white font-semibold">Tasks unavailable</div>
          <div className="text-slate-400 text-sm mt-1">{swarmData.reason}</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="text-white font-semibold">Filters</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-500 text-xs block mb-1">Agent</label>
                <select
                  value={taskAgentFilter}
                  onChange={(e) => setTaskAgentFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                >
                  {taskAgentOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs block mb-1">Status</label>
                <select
                  value={taskStatusFilter}
                  onChange={(e) => setTaskStatusFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                >
                  <option value="all">all</option>
                  <option value="queued">queued</option>
                  <option value="running">running</option>
                  <option value="needs_attention">needs_attention</option>
                  <option value="done">done</option>
                  <option value="failed">failed</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-slate-500 text-xs block mb-1">Search (id / description)</label>
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="mission-center..."
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="text-slate-500 text-xs mt-2">
              Showing {taskSummary.total} task(s). queued {taskSummary.queued} • running {taskSummary.running} • needs_attention {taskSummary.needs_attention} • done {taskSummary.done} • failed {taskSummary.failed}
            </div>
          </div>

          {taskViewMode === 'board' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {(['queued', 'running', 'needs_attention', 'done', 'failed'] as const).map((col) => (
                <div key={col} className="card">
                  <div className="text-white font-semibold">{col}</div>
                  <div className="mt-4 space-y-3">
                    {taskBuckets[col].length === 0 && <div className="text-slate-400 text-sm">None</div>}
                    {taskBuckets[col].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTaskId(t.id)}
                        className="w-full text-left bg-slate-950/40 border border-slate-700 rounded-lg p-3 hover:bg-slate-950/70"
                      >
                        <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                        <div className="text-slate-400 text-xs mt-1">
                          {(t.projectId || 'unassigned')} • {(t.agent || 'agent?')} • {msToRelative(t.updatedAt || t.createdAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full text-xs">
                  <thead className="bg-slate-900/70">
                    <tr className="text-slate-400">
                      <th className="text-left px-3 py-2 font-medium">id</th>
                      <th className="text-left px-3 py-2 font-medium">description</th>
                      <th className="text-left px-3 py-2 font-medium">project</th>
                      <th className="text-left px-3 py-2 font-medium">agent</th>
                      <th className="text-left px-3 py-2 font-medium">status</th>
                      <th className="text-left px-3 py-2 font-medium">attempts</th>
                      <th className="text-left px-3 py-2 font-medium">updated</th>
                      <th className="text-left px-3 py-2 font-medium">tmux</th>
                      <th className="text-left px-3 py-2 font-medium">note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t border-slate-800 hover:bg-slate-900/60 cursor-pointer"
                        onClick={() => setSelectedTaskId(t.id)}
                      >
                        <td className="px-3 py-2 text-slate-100 whitespace-nowrap">{t.id}</td>
                        <td className="px-3 py-2 text-slate-200 max-w-[340px] truncate" title={t.description || ''}>
                          {t.description || 'n/a'}
                        </td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{t.projectId || 'unassigned'}</td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{t.agent || 'n/a'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded border ${taskStatusClass(t.status)}`}>{t.status || 'unknown'}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{t.attempts ?? 0} / {t.maxAttempts ?? '?'}</td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{msToHuman(t.updatedAt || t.createdAt)}</td>
                        <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate" title={t.tmuxSession || ''}>
                          {t.tmuxSession || 'n/a'}
                        </td>
                        <td className="px-3 py-2 text-slate-300 max-w-[320px] truncate" title={t.note || ''}>
                          {t.note || 'n/a'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selectedTaskId && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm p-4 md:p-6"
          onClick={() => setSelectedTaskId('')}
        >
          <div
            className="mx-auto w-full max-w-5xl max-h-full overflow-hidden bg-slate-900 border border-slate-700 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">Task details</div>
                <div className="text-slate-400 text-xs truncate">{selectedTaskId}</div>
              </div>
              <button
                onClick={() => setSelectedTaskId('')}
                className="text-slate-300 hover:text-white text-sm border border-slate-600 rounded px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[75vh] space-y-4">
              {taskDetailsLoading && !taskDetails && <div className="text-slate-400 text-sm">Loading…</div>}
              {taskDetailsLoading && taskDetails && <div className="text-slate-500 text-xs">Refreshing…</div>}

              {taskDetails && !taskDetails.available && <div className="text-rose-200 text-sm">{taskDetails.reason}</div>}

              {taskDetails && taskDetails.available && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {(
                      [
                        ['id', taskDetails.task.id],
                        ['projectId', taskDetails.task.projectId || 'n/a'],
                        ['description', taskDetails.task.description || 'n/a'],
                        ['agent', taskDetails.task.agent || 'n/a'],
                        ['status', taskDetails.task.status || 'unknown'],
                        ['attempts', `${taskDetails.task.attempts ?? 0} / ${taskDetails.task.maxAttempts ?? '?'}`],
                        ['updatedAt', msToHuman(taskDetails.task.updatedAt || taskDetails.task.createdAt)],
                        ['branch', taskDetails.task.branch || 'n/a'],
                        ['tmuxSession', taskDetails.task.tmuxSession || 'n/a'],
                        ['note', taskDetails.task.note || 'n/a'],
                      ] as Array<[string, string]>
                    ).map(([k, v]) => (
                      <div key={k} className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                        <div className="text-slate-500 text-xs">{k}</div>
                        <div className="text-slate-100 mt-1 break-all">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-white font-semibold">tmux attach</div>
                        <div className="text-slate-400 text-xs mt-1">{taskDetails.tmuxAttachCommand || 'No tmux session available.'}</div>
                      </div>
                      <button
                        disabled={!taskDetails.tmuxAttachCommand}
                        onClick={() => taskDetails.tmuxAttachCommand && copyText(taskDetails.tmuxAttachCommand)}
                        className="text-xs px-3 py-2 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Copy
                      </button>
                    </div>
                    {copiedText && <div className="text-slate-500 text-xs mt-2">Copied.</div>}
                    <div className="text-slate-500 text-xs mt-2">(Log tail hidden — dashboard is task-first.)</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const JobsView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white text-lg font-semibold">Jobs</div>
          <div className="text-slate-500 text-xs">Cron jobs (OpenClaw scheduler) — not the same as swarm tasks</div>
        </div>
        <div className="text-slate-500 text-xs">auto-refreshes every 10s</div>
      </div>

      {!cronData ? (
        <div className="card">
          <div className="text-white font-semibold">Jobs unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : !cronData.available ? (
        <div className="card">
          <div className="text-white font-semibold">Jobs unavailable</div>
          <div className="text-slate-400 text-sm mt-1">{cronData.reason}</div>
        </div>
      ) : cronData.jobs.length === 0 ? (
        <div className="card">
          <div className="text-white font-semibold">No cron jobs configured</div>
          <div className="text-slate-400 text-sm mt-1">You can add jobs via OpenClaw cron. This panel will populate automatically.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card">
              <div className="text-slate-400 text-xs">needs attention</div>
              <div className="text-2xl font-bold mt-2">{jobBuckets.needs.length}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">scheduled</div>
              <div className="text-2xl font-bold mt-2">{jobBuckets.scheduled.length}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">recently ok</div>
              <div className="text-2xl font-bold mt-2">{jobBuckets.completed.length}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">disabled</div>
              <div className="text-2xl font-bold mt-2">{jobBuckets.disabled.length}</div>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-xs">
                <thead className="bg-slate-900/70">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2 font-medium">name</th>
                    <th className="text-left px-3 py-2 font-medium">enabled</th>
                    <th className="text-left px-3 py-2 font-medium">schedule</th>
                    <th className="text-left px-3 py-2 font-medium">last run</th>
                    <th className="text-left px-3 py-2 font-medium">status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job: any) => (
                    <tr
                      key={job.id}
                      className="border-t border-slate-800 hover:bg-slate-900/60 cursor-pointer"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <td className="px-3 py-2 text-slate-100 max-w-[420px] truncate" title={job.name || ''}>
                        {job.name || job.id}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{job.enabled ? 'yes' : 'no'}</td>
                      <td className="px-3 py-2 text-slate-300">{scheduleLabel(job)}</td>
                      <td className="px-3 py-2 text-slate-300">{job?.state?.lastRunAtMs ? msToHuman(job.state.lastRunAtMs) : 'n/a'}</td>
                      <td className="px-3 py-2 text-slate-300">{job?.state?.lastRunStatus || 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedJobId && (
            <div className="card">
              <div className="text-white font-semibold">Job runs</div>
              <div className="text-slate-500 text-xs mt-1">jobId: {selectedJobId}</div>
              {!cronRuns ? (
                <div className="text-slate-400 text-sm mt-2">No runs payload.</div>
              ) : !cronRuns.available ? (
                <div className="text-slate-400 text-sm mt-2">{cronRuns.reason}</div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  {cronRuns.entries.length === 0 ? (
                    <div className="text-slate-400">No runs yet.</div>
                  ) : (
                    cronRuns.entries.slice(0, 10).map((e: any) => (
                      <div key={e.runId} className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                        <div className="text-slate-100">{e.status || 'n/a'} • {e.finishedAtMs ? msToHuman(e.finishedAtMs) : 'in progress'}</div>
                        {e.error && <pre className="text-xs text-rose-200 mt-2 whitespace-pre-wrap">{String(e.error).slice(0, 600)}</pre>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  const AgentsView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white text-lg font-semibold">Agents</div>
          <div className="text-slate-500 text-xs">Recent OpenClaw sessions grouped by agentId</div>
        </div>
        <div className="text-slate-500 text-xs">auto-refreshes every 10s</div>
      </div>

      {!agentsData ? (
        <div className="card">
          <div className="text-white font-semibold">Agents unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : !agentsData.available ? (
        <div className="card">
          <div className="text-white font-semibold">Agents unavailable</div>
          <div className="text-slate-400 text-sm mt-1">{agentsData.reason}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedAgentSessions.map((g) => (
            <div key={g.agentId} className="card">
              <div className="flex items-center justify-between">
                <div className="text-white font-semibold">{g.agentId}</div>
                <div className="text-slate-500 text-xs">{g.sessions.length} session(s)</div>
              </div>

              <div className="mt-3 space-y-2">
                {g.sessions.slice(0, 12).map((s) => (
                  <div key={s.key} className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-100 truncate">
                        {s.kind} • {s.model || 'model?'}
                      </div>
                      <div className="text-slate-500 text-xs truncate">updated {new Date(s.updatedAt).toLocaleString()}</div>
                      <div className="text-slate-500 text-xs truncate">key: {s.key}</div>
                    </div>

                    <button
                      onClick={() => copyText(s.key)}
                      className="text-xs px-2 py-1 border border-slate-600 rounded text-slate-200 hover:bg-slate-800"
                    >
                      Copy key
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {copiedText && <div className="text-slate-500 text-xs">Copied.</div>}
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-300">Loading Mission Center</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Mission Center</title>
        <meta name="description" content="Mission Center local OpenClaw dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950">
        <div className="flex flex-col md:flex-row min-h-screen">
          <Sidebar active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 min-w-0">
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
              <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-white text-lg md:text-xl font-semibold tracking-wide truncate">Mission Center</div>
                  <div className="text-slate-400 text-xs mt-0.5 truncate">Task-first dashboard</div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-xs text-slate-500">Project</div>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                  >
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>
                        {p === 'all' ? 'All' : p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </header>

            <main className="px-4 md:px-6 py-6">
              {activeTab === 'overview' && <OverviewView />}
              {activeTab === 'projects' && <ProjectsView />}
              {activeTab === 'tasks' && <TasksView />}
              {activeTab === 'jobs' && <JobsView />}
              {activeTab === 'agents' && <AgentsView />}
            </main>

            <footer className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500">Mission Center • local-only</footer>
          </div>
        </div>
      </div>
    </>
  )
}
