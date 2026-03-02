import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Sidebar, { type NavKey } from '../components/Sidebar'

type AlertsData =
  | { dataSource: 'derived'; available: true; alerts: any[]; lastUpdated: string }
  | { dataSource: 'derived'; available: false; reason: string; lastUpdated: string }

type TasksListData =
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

type TaskDetailsData =
  | {
      dataSource: 'clawdbot_task_details'
      available: true
      task: any
      log: { available: true; path: string; tail: string; lineCount: number } | { available: false; reason: string }
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_task_details'
      available: false
      reason: string
      lastUpdated: string
    }


type SwarmTask = {
  id: string
  projectId?: string
  description?: string
  agent?: string
  status: string
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
      groupedTasks: Array<{
        projectId: string
        projectName?: string
        tasks: SwarmTask[]
      }>
      projects: Array<{ id: string; name?: string; enabled?: boolean }>
      filters: {
        projectIds: string[]
        agents: string[]
        statuses: string[]
      }
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_swarm_status'
      available: false
      reason: string
      lastUpdated: string
    }

type SwarmTaskDetailsData =
  | {
      dataSource: 'clawdbot_swarm_task_details'
      available: true
      task: SwarmTask
      tmuxAttachCommand: string | null
      log:
        | { available: true; path: string; tail: string; lineCount: number }
        | { available: false; reason: string }
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_swarm_task_details'
      available: false
      reason: string
      lastUpdated: string
    }

type CronListData =
  | { dataSource: 'openclaw_cron_list'; available: true; jobs: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_list'; available: false; reason: string; lastUpdated: string }

type CronRunsData =
  | { dataSource: 'openclaw_cron_runs'; available: true; entries: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_runs'; available: false; reason: string; lastUpdated: string }

type UsageData =
  | {
      dataSource: 'local_logs'
      available: true
      window5h: { start: string; end: string; requestCountApprox: number; models: Record<string, number> }
      window7d: { start: string; end: string; requestCountApprox: number; models: Record<string, number> }
      alerts: Array<{ level: 'info' | 'warn' | 'critical'; code: string; message: string; evidence?: string }>
      notes: string[]
      lastUpdated: string
    }
  | {
      dataSource: 'local_logs'
      available: false
      reason: string
      lastUpdated: string
    }

type LogData =
  | {
      dataSource: 'local_log'
      available: true
      path: string
      tail: string
      lineCount: number
      lastUpdated: string
    }
  | {
      dataSource: 'local_log'
      available: false
      reason: string
      path: string
      lastUpdated: string
    }

type AnyJson = any

type StatusData =
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
      sessions: Array<{
        agentId: string
        key: string
        kind: string
        age: number
        model?: string
        percentUsed?: number
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
      }>
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_status_json'
      available: false
      reason: string
      lastUpdated: string
    }

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

type ActivityFeedData =
  | {
      dataSource: 'openclaw_gateway_logs'
      available: true
      stream: 'gateway' | 'gateway_err' | 'both'
      logs: Array<{
        id: 'gateway' | 'gatewayErr'
        path: string
        exists: boolean
        lineCount: number
        tail: string
      }>
      combinedTail: string
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_gateway_logs'
      available: false
      stream: 'gateway' | 'gateway_err' | 'both'
      reason: string
      lastUpdated: string
    }

function parseProjectTag(name?: string): string | null {
  if (!name) return null
  const m = name.match(/^\[project:([^\]]+)\]\s+/)
  return m?.[1] || null
}

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

function ageLabel(ageMs?: number | null): string {
  if (typeof ageMs !== 'number' || ageMs < 0) return 'n/a'
  const s = Math.floor(ageMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function isoToReadable(iso?: string): string {
  if (!iso) return 'n/a'
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'n/a'
  return new Date(ts).toLocaleString()
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

function pickRecentAlertLines(logText: string, n = 12) {
  if (!logText) return 'No lines'
  return logText
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-n)
    .join('\n')
}

function pctSafe(value: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavKey>('overview')

  const [alertsData, setAlertsData] = useState<AlertsData | null>(null)
  const [tasksList, setTasksList] = useState<TasksListData | null>(null)
  const [cronList, setCronList] = useState<CronListData | null>(null)
  const [openclawStatus, setOpenclawStatus] = useState<StatusData | null>(null)
  const [agentsList, setAgentsList] = useState<AgentsListData | null>(null)
  const [activityFeed, setActivityFeed] = useState<ActivityFeedData | null>(null)
  const [debugSetup, setDebugSetup] = useState<AnyJson | null>(null)
  const [debugModels, setDebugModels] = useState<AnyJson | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [maintenanceLog, setMaintenanceLog] = useState<LogData | null>(null)
  const [traderLog, setTraderLog] = useState<LogData | null>(null)


  const [swarmStatusData, setSwarmStatusData] = useState<SwarmStatusData | null>(null)
  const [selectedSwarmTaskId, setSelectedSwarmTaskId] = useState<string>('')
  const [swarmTaskDetails, setSwarmTaskDetails] = useState<SwarmTaskDetailsData | null>(null)
  const [swarmTaskDetailsLoading, setSwarmTaskDetailsLoading] = useState(false)
  const [swarmProjectFilter, setSwarmProjectFilter] = useState<string>('all')
  const [swarmStatusFilter, setSwarmStatusFilter] = useState<string>('all')
  const [swarmAgentFilter, setSwarmAgentFilter] = useState<string>('all')
  const [swarmSearch, setSwarmSearch] = useState<string>('')
  const [swarmLastRefreshedAt, setSwarmLastRefreshedAt] = useState<number | null>(null)
  const [copyNotice, setCopyNotice] = useState<string>('')

  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [cronRuns, setCronRuns] = useState<CronRunsData | null>(null)
  const [copiedSessionKey, setCopiedSessionKey] = useState<string>('')

  const [loading, setLoading] = useState(true)

  const safeFetchJson = async (url: string) => {
    const response = await fetch(url)
    return response.json()
  }


  const refreshSwarmStatus = async () => {
    try {
      const data = await safeFetchJson('/api/swarm/status')
      setSwarmStatusData(data)
      setSwarmLastRefreshedAt(Date.now())
    } catch (e) {
      console.error('refreshSwarmStatus failed', e)
    }
  }

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [alertsRes, tasksRes, cronRes, statusRes, agentsRes, activityRes, setupRes, modelsRes, usageRes, maintRes, traderRes] = await Promise.all([
          safeFetchJson('/api/alerts'),
          // sync=1: best-effort orchestrator check, throttled server-side
          safeFetchJson('/api/tasks/list?sync=1'),
          safeFetchJson('/api/cron/list'),
          safeFetchJson('/api/status'),
          safeFetchJson('/api/agents/list'),
          safeFetchJson('/api/activity/openclaw-log'),
          safeFetchJson('/api/openclaw-setup'),
          safeFetchJson('/api/models/list'),
          safeFetchJson('/api/openclaw-usage'),
          safeFetchJson('/api/logs/maintenance'),
          safeFetchJson('/api/logs/trader'),
        ])

        setAlertsData(alertsRes)
        setTasksList(tasksRes)
        setCronList(cronRes)
        setOpenclawStatus(statusRes)
        setAgentsList(agentsRes)
        setActivityFeed(activityRes)
        setDebugSetup(setupRes)
        setDebugModels(modelsRes)
        setUsageData(usageRes)
        setMaintenanceLog(maintRes)
        setTraderLog(traderRes)
      } catch (e) {
        console.error('fetchAll failed', e)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
    const interval = setInterval(fetchAll, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedJobId) return

    const fetchRuns = async () => {
      try {
        const res = await fetch(`/api/cron/runs?id=${encodeURIComponent(selectedJobId)}`)
        setCronRuns(await res.json())
      } catch (e) {
        console.error('fetchRuns failed', e)
      }
    }

    fetchRuns()
    const interval = setInterval(fetchRuns, 15000)
    return () => clearInterval(interval)
  }, [selectedJobId])

  const projectOptions = useMemo(() => {
    const jobs = cronList && cronList.available ? cronList.jobs : []
    const set = new Set<string>()

    // from cron job names: [project:<id>] ...
    for (const j of jobs) {
      const tag = parseProjectTag(j?.name)
      if (tag) set.add(tag)
    }

    // from clawdbot config/task registry
    if (tasksList && tasksList.available) {
      for (const p of tasksList.projects || []) {
        if (p?.id) set.add(p.id)
      }
      for (const t of tasksList.tasks || []) {
        if (t?.projectId) set.add(t.projectId)
      }
    }

    return ['all', ...Array.from(set).sort()]
  }, [cronList, tasksList])


  useEffect(() => {
    if (!selectedSwarmTaskId) {
      setSwarmTaskDetails(null)
      setSwarmTaskDetailsLoading(false)
      return
    }

    let cancelled = false

    const fetchSwarmTaskDetails = async () => {
      setSwarmTaskDetailsLoading(true)
      try {
        const response = await fetch(`/api/swarm/task-details?id=${encodeURIComponent(selectedSwarmTaskId)}`)
        const data = await response.json()
        if (!cancelled) setSwarmTaskDetails(data)
      } catch (_err) {
        if (!cancelled) {
          setSwarmTaskDetails({
            dataSource: 'clawdbot_swarm_task_details',
            available: false,
            reason: 'Failed to load task details.',
            lastUpdated: new Date().toISOString(),
          })
        }
      } finally {
        if (!cancelled) setSwarmTaskDetailsLoading(false)
      }
    }

    fetchSwarmTaskDetails()
    const interval = setInterval(fetchSwarmTaskDetails, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selectedSwarmTaskId])


  const filteredJobs = useMemo(() => {
    const jobs = cronList && cronList.available ? cronList.jobs : []
    if (selectedProject === 'all') return jobs
    return jobs.filter((j: any) => parseProjectTag(j?.name) === selectedProject)
  }, [cronList, selectedProject])

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

  const filteredTasks = useMemo(() => {
    const tasks = tasksList && tasksList.available ? tasksList.tasks : []
    if (selectedProject === 'all') return tasks
    return tasks.filter((t: any) => t?.projectId === selectedProject)
  }, [tasksList, selectedProject])

  const taskBuckets = useMemo(() => {
    const queued: any[] = []
    const running: any[] = []
    const needsAttention: any[] = []
    const done: any[] = []
    const failed: any[] = []
    const unknown: any[] = []

    for (const t of filteredTasks) {
      const s = String(t?.status || 'unknown')
      if (s === 'queued') queued.push(t)
      else if (s === 'running') running.push(t)
      else if (s === 'needs_attention') needsAttention.push(t)
      else if (s === 'done') done.push(t)
      else if (s === 'failed') failed.push(t)
      else unknown.push(t)
    }

    // newest first within buckets
    const sortByUpdated = (a: any, b: any) => (b?.updatedAt || 0) - (a?.updatedAt || 0)
    queued.sort(sortByUpdated)
    running.sort(sortByUpdated)
    needsAttention.sort(sortByUpdated)
    done.sort(sortByUpdated)
    failed.sort(sortByUpdated)
    unknown.sort(sortByUpdated)

    return { queued, running, needsAttention, done, failed, unknown }
  }, [filteredTasks])

  const swarmTasks = useMemo(() => {
    if (!swarmStatusData || !swarmStatusData.available) return []
    return swarmStatusData.tasks || []
  }, [swarmStatusData])

  const swarmProjectOptions = useMemo(() => {
    if (!swarmStatusData || !swarmStatusData.available) return ['all']
    const set = new Set<string>()
    for (const project of swarmStatusData.projects || []) {
      if (project?.id) set.add(project.id)
    }
    for (const task of swarmStatusData.tasks || []) {
      set.add(task.projectId || 'unassigned')
    }
    return ['all', ...Array.from(set).sort()]
  }, [swarmStatusData])

  const swarmAgentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const task of swarmTasks) {
      if (task.agent) set.add(task.agent)
    }
    return ['all', ...Array.from(set).sort()]
  }, [swarmTasks])

  const filteredSwarmTasks = useMemo(() => {
    const q = swarmSearch.trim().toLowerCase()
    return swarmTasks.filter((task) => {
      const project = task.projectId || 'unassigned'
      const status = task.status || 'unknown'
      const agent = task.agent || 'unknown'

      if (swarmProjectFilter !== 'all' && project !== swarmProjectFilter) return false
      if (swarmStatusFilter !== 'all' && status !== swarmStatusFilter) return false
      if (swarmAgentFilter !== 'all' && agent !== swarmAgentFilter) return false
      if (!q) return true

      const idHit = task.id.toLowerCase().includes(q)
      const descHit = (task.description || '').toLowerCase().includes(q)
      return idHit || descHit
    })
  }, [swarmTasks, swarmProjectFilter, swarmStatusFilter, swarmAgentFilter, swarmSearch])

  const filteredSwarmSummary = useMemo(() => {
    let queued = 0
    let running = 0
    let needsAttention = 0
    let done = 0
    let failed = 0

    for (const task of filteredSwarmTasks) {
      if (task.status === 'queued') queued += 1
      else if (task.status === 'running') running += 1
      else if (task.status === 'needs_attention') needsAttention += 1
      else if (task.status === 'done') done += 1
      else if (task.status === 'failed') failed += 1
    }

    return {
      total: filteredSwarmTasks.length,
      queued,
      running,
      needs_attention: needsAttention,
      done,
      failed,
    }
  }, [filteredSwarmTasks])

  const groupedFilteredSwarmTasks = useMemo(() => {
    const grouped = new Map<string, SwarmTask[]>()
    for (const task of filteredSwarmTasks) {
      const key = task.projectId || 'unassigned'
      const list = grouped.get(key)
      if (list) list.push(task)
      else grouped.set(key, [task])
    }

    return Array.from(grouped.entries())
      .map(([projectId, tasks]) => ({
        projectId,
        projectName:
          swarmStatusData && swarmStatusData.available ? swarmStatusData.projects.find((p) => p.id === projectId)?.name : undefined,
        tasks: tasks.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)),
      }))
      .sort((a, b) => a.projectId.localeCompare(b.projectId))
  }, [filteredSwarmTasks, swarmStatusData])

  const openclawSummary = useMemo(() => {
    if (!openclawStatus) return null
    if (!openclawStatus.available) return null
    return {
      reachable: openclawStatus.openclaw.reachable,
      sessionCount: (openclawStatus.sessions || []).length,
      gatewayBind: openclawStatus.openclaw.gatewayBind || 'loopback',
      dashboardUrl: openclawStatus.openclaw.dashboardUrl || 'https://mbrs-mac-mini.tail9b718b.ts.net',
      defaultModel: openclawStatus.openclaw.defaultModel || 'unknown',
      recentSessions: openclawStatus.sessions || [],
      heartbeatEvery: openclawStatus.openclaw.heartbeatEvery || 'n/a',
    }
  }, [openclawStatus])

  const usageSummary = useMemo(() => {
    if (!usageData || !usageData.available) return null
    const topModels5h = Object.entries(usageData.window5h.models)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    const pct = pctSafe(usageData.window5h.requestCountApprox, 300)
    return {
      window5h: usageData.window5h,
      window7d: usageData.window7d,
      alerts: usageData.alerts,
      topModels5h,
      pct,
    }
  }, [usageData])

  const groupedAgentSessions = useMemo(() => {
    if (!agentsList || !agentsList.available) return []

    const groups = new Map<string, AgentSession[]>()
    for (const session of agentsList.sessions || []) {
      const agentId = session.agentId || 'unknown'
      const list = groups.get(agentId)
      if (list) list.push(session)
      else groups.set(agentId, [session])
    }

    const grouped = Array.from(groups.entries()).map(([agentId, sessions]) => {
      sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      return {
        agentId,
        sessions,
        newestTs: Date.parse(sessions[0]?.updatedAt || ''),
      }
    })

    grouped.sort((a, b) => (Number.isNaN(b.newestTs) ? 0 : b.newestTs) - (Number.isNaN(a.newestTs) ? 0 : a.newestTs))
    return grouped
  }, [agentsList])

  const copySessionKey = async (key: string) => {
    if (!key || typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(key)
      setCopiedSessionKey(key)
      setTimeout(() => setCopiedSessionKey(''), 1200)
    } catch (err) {
      console.error('Failed to copy session key', err)
    }
  }

const SwarmStatusView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-white text-lg font-semibold">Swarm Status</div>
        <div className="flex items-center gap-3">
          <button onClick={refreshSwarmStatus} className="text-xs px-3 py-2 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-800">
            Refresh
          </button>
          <div className="text-slate-500 text-xs">
            auto-refreshes every 10s • last refreshed {swarmLastRefreshedAt ? new Date(swarmLastRefreshedAt).toLocaleTimeString() : 'n/a'}
          </div>
        </div>
      </div>

      {!swarmStatusData ? (
        <div className="card">
          <div className="text-white font-semibold">Swarm status unavailable</div>
          <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
        </div>
      ) : !swarmStatusData.available ? (
        <div className="card">
          <div className="text-white font-semibold">Swarm status unavailable</div>
          <div className="text-slate-400 text-sm mt-1">{swarmStatusData.reason}</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="text-white font-semibold">Filters</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-500 text-xs block mb-1">Project</label>
                <select
                  value={swarmProjectFilter}
                  onChange={(e) => setSwarmProjectFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                >
                  {swarmProjectOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs block mb-1">Status</label>
                <select
                  value={swarmStatusFilter}
                  onChange={(e) => setSwarmStatusFilter(e.target.value)}
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
              <div>
                <label className="text-slate-500 text-xs block mb-1">Agent</label>
                <select
                  value={swarmAgentFilter}
                  onChange={(e) => setSwarmAgentFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                >
                  {swarmAgentOptions.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs block mb-1">Search (id / description)</label>
                <input
                  type="text"
                  value={swarmSearch}
                  onChange={(e) => setSwarmSearch(e.target.value)}
                  placeholder="mission-center..."
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="text-slate-500 text-xs mt-2">
              Showing {filteredSwarmTasks.length} of {swarmStatusData.summary.total} task(s). Last payload: {swarmStatusData.lastUpdated}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="card">
              <div className="text-slate-400 text-xs">total</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.total}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">queued</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.queued}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">running</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.running}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">needs_attention</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.needs_attention}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">done</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.done}</div>
            </div>
            <div className="card">
              <div className="text-slate-400 text-xs">failed</div>
              <div className="text-2xl font-bold mt-2">{filteredSwarmSummary.failed}</div>
            </div>
          </div>

          {groupedFilteredSwarmTasks.length === 0 ? (
            <div className="card">
              <div className="text-white font-semibold">No matching tasks</div>
              <div className="text-slate-400 text-sm mt-1">Adjust filters or search to broaden the results.</div>
            </div>
          ) : (
            groupedFilteredSwarmTasks.map((group) => (
              <div key={group.projectId} className="card p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">{group.projectName || group.projectId}</div>
                    <div className="text-slate-500 text-xs mt-1">projectId: {group.projectId}</div>
                  </div>
                  <div className="text-slate-400 text-sm">{group.tasks.length} task(s)</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1280px] w-full text-xs">
                    <thead className="bg-slate-900/70">
                      <tr className="text-slate-400">
                        <th className="text-left px-3 py-2 font-medium">id</th>
                        <th className="text-left px-3 py-2 font-medium">description</th>
                        <th className="text-left px-3 py-2 font-medium">agent</th>
                        <th className="text-left px-3 py-2 font-medium">status</th>
                        <th className="text-left px-3 py-2 font-medium">attempts</th>
                        <th className="text-left px-3 py-2 font-medium">updatedAt</th>
                        <th className="text-left px-3 py-2 font-medium">branch</th>
                        <th className="text-left px-3 py-2 font-medium">tmuxSession</th>
                        <th className="text-left px-3 py-2 font-medium">worktree</th>
                        <th className="text-left px-3 py-2 font-medium">note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => (
                        <tr
                          key={task.id}
                          className="border-t border-slate-800 hover:bg-slate-900/60 cursor-pointer"
                          onClick={() => {
                            setCopyNotice('')
                            setSelectedSwarmTaskId(task.id)
                          }}
                        >
                          <td className="px-3 py-2 text-slate-100 whitespace-nowrap">{task.id}</td>
                          <td className="px-3 py-2 text-slate-200 max-w-[300px] truncate" title={task.description || ''}>
                            {task.description || 'n/a'}
                          </td>
                          <td className="px-3 py-2 text-slate-200 whitespace-nowrap">{task.agent || 'n/a'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded border ${taskStatusClass(task.status)}`}>{task.status || 'unknown'}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-200 whitespace-nowrap">{task.attempts ?? 0} / {task.maxAttempts ?? '?'}</td>
                          <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{msToHuman(task.updatedAt || task.createdAt)}</td>
                          <td className="px-3 py-2 text-slate-300 max-w-[200px] truncate" title={task.branch || ''}>
                            {task.branch || 'n/a'}
                          </td>
                          <td className="px-3 py-2 text-slate-300 max-w-[180px] truncate" title={task.tmuxSession || ''}>
                            {task.tmuxSession || 'n/a'}
                          </td>
                          <td className="px-3 py-2 text-slate-300 max-w-[300px] truncate" title={task.worktree || ''}>
                            {task.worktree || 'n/a'}
                          </td>
                          <td className="px-3 py-2 text-slate-300 max-w-[280px] truncate" title={task.note || ''}>
                            {task.note || 'n/a'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {selectedSwarmTaskId && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm p-4 md:p-6"
          onClick={() => {
            setCopyNotice('')
            setSelectedSwarmTaskId('')
          }}
        >
          <div
            className="mx-auto w-full max-w-5xl max-h-full overflow-hidden bg-slate-900 border border-slate-700 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">Task details</div>
                <div className="text-slate-400 text-xs truncate">{selectedSwarmTaskId}</div>
              </div>
              <button
                onClick={() => {
                  setCopyNotice('')
                  setSelectedSwarmTaskId('')
                }}
                className="text-slate-300 hover:text-white text-sm border border-slate-600 rounded px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[75vh] space-y-4">
              {swarmTaskDetailsLoading && !swarmTaskDetails && <div className="text-slate-400 text-sm">Loading details...</div>}
              {swarmTaskDetailsLoading && swarmTaskDetails && <div className="text-slate-500 text-xs">Refreshing details...</div>}

              {!swarmTaskDetailsLoading && !swarmTaskDetails && <div className="text-slate-400 text-sm">No task details payload.</div>}

              {swarmTaskDetails && !swarmTaskDetails.available && <div className="text-rose-200 text-sm">{swarmTaskDetails.reason}</div>}

              {swarmTaskDetails && swarmTaskDetails.available && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">id</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.id}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">projectId</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.projectId || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">description</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.description || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">agent</div>
                      <div className="text-slate-100 mt-1">{swarmTaskDetails.task.agent || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">status</div>
                      <div className="mt-1">
                        <span className={`inline-block px-2 py-0.5 rounded border ${taskStatusClass(swarmTaskDetails.task.status)}`}>
                          {swarmTaskDetails.task.status || 'unknown'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">attempts / maxAttempts</div>
                      <div className="text-slate-100 mt-1">{swarmTaskDetails.task.attempts ?? 0} / {swarmTaskDetails.task.maxAttempts ?? '?'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">updatedAt</div>
                      <div className="text-slate-100 mt-1">{msToHuman(swarmTaskDetails.task.updatedAt || swarmTaskDetails.task.createdAt)}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">branch</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.branch || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">tmuxSession</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.tmuxSession || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">worktree</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.worktree || 'n/a'}</div>
                    </div>
                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-500 text-xs">note</div>
                      <div className="text-slate-100 mt-1 break-all">{swarmTaskDetails.task.note || 'n/a'}</div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-white font-semibold">tmux attach command</div>
                        <div className="text-slate-400 text-xs mt-1">{swarmTaskDetails.tmuxAttachCommand || 'No tmux session available.'}</div>
                      </div>
                      <button
                        disabled={!swarmTaskDetails.tmuxAttachCommand}
                        onClick={async () => {
                          if (!swarmTaskDetails.tmuxAttachCommand) return
                          try {
                            await navigator.clipboard.writeText(swarmTaskDetails.tmuxAttachCommand)
                            setCopyNotice('Copied.')
                          } catch {
                            setCopyNotice('Copy failed.')
                          }
                        }}
                        className="text-xs px-3 py-2 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Copy tmux attach command
                      </button>
                    </div>
                    {copyNotice && <div className="text-slate-400 text-xs mt-2">{copyNotice}</div>}
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">Session log tail (~80 lines)</div>
                    {swarmTaskDetails.log.available ? (
                      <>
                        <div className="text-slate-500 text-xs mt-1">{swarmTaskDetails.log.path}</div>
                        <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap overflow-x-auto">{swarmTaskDetails.log.tail || '(log is empty)'}</pre>
                      </>
                    ) : (
                      <div className="text-slate-400 text-sm mt-2">{swarmTaskDetails.log.reason}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
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
                  <div className="text-slate-400 text-xs mt-0.5 truncate">Operational dashboard for Max&apos;s OpenClaw setup</div>
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
              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Overview</div>
                    <div className="text-slate-500 text-xs">refreshes every 10s</div>
                  </div>

                  {!openclawStatus ? (
                    <div className="card">
                      <div className="text-white font-semibold">OpenClaw status unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">No status payload yet.</div>
                    </div>
                  ) : openclawStatus.available ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                      <div className="card">
                        <div className="text-slate-400 text-sm">OpenClaw Gateway</div>
                        <div className="text-2xl font-bold text-green-400 mt-2">{openclawSummary?.reachable ? 'Online' : 'Offline'}</div>
                        <div className="text-slate-500 text-xs mt-2">Bind: {openclawSummary?.gatewayBind}</div>
                      </div>
                      <div className="card">
                        <div className="text-slate-400 text-sm">Active Sessions</div>
                        <div className="text-2xl font-bold mt-2">{openclawSummary?.sessionCount || 0}</div>
                        <div className="text-slate-500 text-xs mt-2">Main heartbeat: {openclawSummary?.heartbeatEvery || 'n/a'}</div>
                      </div>
                      <div className="card">
                        <div className="text-slate-400 text-sm">Cron attention</div>
                        <div className="text-2xl font-bold mt-2">{jobBuckets.needs.length}</div>
                        <div className="text-slate-500 text-xs mt-2">Needs attention / errors</div>
                      </div>
                      <div className="card">
                        <div className="text-slate-400 text-sm">5h usage est.</div>
                        {usageSummary ? (
                          <>
                            <div className="text-2xl font-bold mt-2">{usageSummary.window5h.requestCountApprox} req</div>
                            <div className="text-slate-500 text-xs mt-2">{usageSummary.pct}% of conservative 5h window</div>
                          </>
                        ) : (
                          <div className="text-2xl font-bold mt-2">n/a</div>
                        )}
                      </div>
                      <div className="card">
                        <div className="text-slate-400 text-sm">Default Model</div>
                        <div className="text-2xl font-bold mt-2">{openclawSummary?.defaultModel || 'unknown'}</div>
                        <div className="text-slate-500 text-xs mt-2">Auto-check: every 30m</div>
                      </div>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="text-white font-semibold">OpenClaw unreachable</div>
                      <div className="text-slate-400 text-sm mt-1">{openclawStatus.reason}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="card">
                      <div className="text-white font-semibold">Open links</div>
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
                      <div className="text-white font-semibold">Top alerts</div>
                      {!alertsData || !alertsData.available ? (
                        <div className="text-slate-400 text-sm mt-1">No alert payload.</div>
                      ) : (
                        <div className="mt-2 space-y-2 text-sm">
                          {alertsData.alerts.length === 0 ? (
                            <div className="text-slate-400">No alerts</div>
                          ) : (
                            alertsData.alerts
                              .slice(0, 4)
                              .map((a) => <div key={a.id} className="text-slate-200">• {a.title}</div>)
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* SWARM STATUS */}
              {activeTab === 'swarm' && <SwarmStatusView />}

              {/* TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Tasks</div>
                    <div className="text-slate-500 text-xs">board auto-refreshes • status derives from .clawdbot</div>
                  </div>

                  {!tasksList ? (
                    <div className="card">
                      <div className="text-white font-semibold">Tasks unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">No payload yet.</div>
                    </div>
                  ) : !tasksList.available ? (
                    <div className="card">
                      <div className="text-white font-semibold">Tasks unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">{tasksList.reason}</div>
                    </div>
                  ) : (
                    <>
                      <div className="card">
                        <div className="text-white font-semibold">Sync</div>
                        <div className="text-slate-400 text-sm mt-1">
                          Dashboard requests a background orchestrator sync at most once per minute. Last payload: {tasksList.lastUpdated}
                        </div>
                        <div className="text-slate-500 text-xs mt-2">
                          syncAttempted={String(tasksList.syncAttempted)} • syncThrottled={String(tasksList.syncThrottled)} • showing {filteredTasks.length} task(s)
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        <div className="card">
                          <div className="text-white font-semibold">Queued</div>
                          <div className="text-slate-500 text-xs mt-1">backlog / not started</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.queued.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.queued.map((t: any) => (
                              <div key={t.id} className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-400 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Running</div>
                          <div className="text-slate-500 text-xs mt-1">active work</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.running.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.running.map((t: any) => (
                              <div key={t.id} className="bg-slate-950/40 border border-blue-800 rounded-lg p-3">
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-400 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                                {t.branch && <div className="text-slate-500 text-xs mt-1">branch: {t.branch}</div>}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Needs attention</div>
                          <div className="text-slate-500 text-xs mt-1">blocked / failing gate</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.needsAttention.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.needsAttention.map((t: any) => (
                              <div key={t.id} className="bg-slate-950/40 border border-rose-800 rounded-lg p-3">
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-rose-200 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Done</div>
                          <div className="text-slate-500 text-xs mt-1">ready / completed</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.done.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.done.map((t: any) => (
                              <div key={t.id} className="bg-slate-950/40 border border-emerald-800 rounded-lg p-3">
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-emerald-200 text-xs mt-1">{t.projectId || 'no-project'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Failed</div>
                          <div className="text-slate-500 text-xs mt-1">gave up / max attempts</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.failed.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.failed.map((t: any) => (
                              <div key={t.id} className="bg-slate-950/40 border border-rose-900 rounded-lg p-3">
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-rose-200 text-xs mt-1">{t.projectId || 'no-project'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {taskBuckets.unknown.length > 0 && (
                        <div className="card">
                          <div className="text-white font-semibold">Unknown status</div>
                          <div className="text-slate-500 text-xs mt-1">tasks with unrecognized state</div>
                          <pre className="text-xs text-slate-300 mt-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(taskBuckets.unknown, null, 2)}</pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ALERT INBOX */}
              {activeTab === 'alerts' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Alert Inbox</div>
                    <div className="text-slate-500 text-xs">refreshes every 10s</div>
                  </div>

                  {!alertsData || !alertsData.available ? (
                    <div className="card">
                      <div className="text-white font-semibold">Alerts unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">{alertsData && !alertsData.available ? alertsData.reason : 'No data yet.'}</div>
                    </div>
                  ) : alertsData.alerts.length === 0 ? (
                    <div className="card">
                      <div className="text-white font-semibold">No alerts</div>
                      <div className="text-slate-400 text-sm mt-1">No errors/warnings detected that require your attention.</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {alertsData.alerts
                        .filter((a: any) => selectedProject === 'all' || a.project === selectedProject)
                        .map((a: any) => (
                          <div key={a.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-white font-semibold truncate">{a.title}</div>
                                <div className="text-slate-400 text-xs mt-1">{a.source}{a.project ? `  project:${a.project}` : ''}</div>
                              </div>
                              <div
                                className={
                                  'text-xs font-semibold px-2 py-1 rounded ' +
                                  (a.severity === 'error'
                                    ? 'bg-rose-900/60 text-rose-200 border border-rose-800'
                                    : 'bg-amber-900/60 text-amber-200 border border-amber-800')
                                }
                              >
                                {a.severity.toUpperCase()}
                              </div>
                            </div>
                            <pre className="text-xs text-slate-300 mt-3 whitespace-pre-wrap overflow-x-auto">{a.detail}</pre>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* JOBS BOARD */}
              {activeTab === 'jobs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Jobs Board</div>
                    <div className="text-slate-500 text-xs">auto-updates from openclaw cron list</div>
                  </div>

                  {!cronList || !cronList.available ? (
                    <div className="card">
                      <div className="text-white font-semibold">Cron jobs unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">{cronList && !cronList.available ? cronList.reason : 'No data yet.'}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                      <div className="card">
                        <div className="text-white font-semibold">Needs attention</div>
                        <div className="text-slate-500 text-xs mt-1">error / consecutive errors</div>
                        <div className="mt-4 space-y-3">
                          {jobBuckets.needs.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                          {jobBuckets.needs.map((job: any) => {
                            const s = job.state || {}
                            return (
                              <button
                                key={job.id}
                                onClick={() => setSelectedJobId(job.id)}
                                className="w-full text-left bg-slate-950/40 border border-rose-800 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{job.name || job.id}</div>
                                <div className="text-rose-200 text-xs mt-1">{s.lastError || `lastRunStatus=${s.lastRunStatus}`}</div>
                                <div className="text-slate-500 text-xs mt-1">Last: {msToRelative(s.lastRunAtMs)}  Next: {msToRelative(s.nextRunAtMs)}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="card">
                        <div className="text-white font-semibold">Scheduled</div>
                        <div className="text-slate-500 text-xs mt-1">running on cadence</div>
                        <div className="mt-4 space-y-3">
                          {jobBuckets.scheduled.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                          {jobBuckets.scheduled.map((job: any) => {
                            const s = job.state || {}
                            return (
                              <button
                                key={job.id}
                                onClick={() => setSelectedJobId(job.id)}
                                className="w-full text-left bg-slate-950/40 border border-slate-700 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{job.name || job.id}</div>
                                <div className="text-slate-400 text-xs mt-1">{scheduleLabel(job)}</div>
                                <div className="text-slate-500 text-xs mt-1">Last: {msToRelative(s.lastRunAtMs)}  Next: {msToRelative(s.nextRunAtMs)}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="card">
                        <div className="text-white font-semibold">Recently completed</div>
                        <div className="text-slate-500 text-xs mt-1">ok in last 12h</div>
                        <div className="mt-4 space-y-3">
                          {jobBuckets.completed.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                          {jobBuckets.completed.map((job: any) => {
                            const s = job.state || {}
                            return (
                              <button
                                key={job.id}
                                onClick={() => setSelectedJobId(job.id)}
                                className="w-full text-left bg-slate-950/40 border border-emerald-800 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{job.name || job.id}</div>
                                <div className="text-emerald-200 text-xs mt-1">Last OK: {msToRelative(s.lastRunAtMs)}</div>
                                <div className="text-slate-500 text-xs mt-1">Next: {msToRelative(s.nextRunAtMs)}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedJobId && (
                    <div className="card">
                      <div className="text-white font-semibold">Selected job</div>
                      <div className="text-slate-400 text-xs mt-1">{selectedJobId}</div>
                      {!cronRuns && <div className="text-slate-400 text-sm mt-3">Loading runs</div>}
                      {cronRuns && !cronRuns.available && <div className="text-slate-400 text-sm mt-3">{cronRuns.reason}</div>}
                      {cronRuns && cronRuns.available && (
                        <pre className="text-xs text-slate-300 mt-3 overflow-x-auto whitespace-pre-wrap">
                          {cronRuns.entries.length ? JSON.stringify(cronRuns.entries.slice(0, 8), null, 2) : 'No runs yet.'}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AGENTS / ACTIVITY */}
              {activeTab === 'agents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Agents / Activity</div>
                    <div className="text-slate-500 text-xs">sessions active when age &lt; 5m • refreshes every 10s</div>
                  </div>

                  {tasksList && tasksList.available && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="card py-4">
                        <div className="text-slate-400 text-xs">Queued</div>
                        <div className="text-xl text-white font-semibold mt-1">{taskBuckets.queued.length}</div>
                      </div>
                      <div className="card py-4">
                        <div className="text-slate-400 text-xs">Running</div>
                        <div className="text-xl text-blue-300 font-semibold mt-1">{taskBuckets.running.length}</div>
                      </div>
                      <div className="card py-4">
                        <div className="text-slate-400 text-xs">Needs attention</div>
                        <div className="text-xl text-rose-300 font-semibold mt-1">{taskBuckets.needsAttention.length}</div>
                      </div>
                      <div className="card py-4">
                        <div className="text-slate-400 text-xs">Done</div>
                        <div className="text-xl text-emerald-300 font-semibold mt-1">{taskBuckets.done.length}</div>
                      </div>
                      <div className="card py-4">
                        <div className="text-slate-400 text-xs">Failed</div>
                        <div className="text-xl text-rose-300 font-semibold mt-1">{taskBuckets.failed.length}</div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="card">
                      <div className="flex items-center justify-between">
                        <div className="text-white font-semibold">OpenClaw Sessions</div>
                        <div className="text-slate-500 text-xs">
                          {agentsList && agentsList.available ? `${agentsList.sessions.length} session(s)` : 'no session payload'}
                        </div>
                      </div>

                      {!agentsList ? (
                        <div className="text-slate-400 text-sm mt-3">No session data yet.</div>
                      ) : !agentsList.available ? (
                        <div className="text-slate-400 text-sm mt-3">{agentsList.reason}</div>
                      ) : groupedAgentSessions.length === 0 ? (
                        <div className="text-slate-400 text-sm mt-3">No recent sessions.</div>
                      ) : (
                        <div className="mt-3 space-y-4">
                          {groupedAgentSessions.map((group) => (
                            <div key={group.agentId} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-slate-200 font-medium">{group.agentId}</div>
                                <div className="text-slate-500 text-xs">{group.sessions.length} session(s)</div>
                              </div>
                              <div className="space-y-2">
                                {group.sessions.map((session) => {
                                  const isActive = typeof session.age === 'number' && session.age < 5 * 60 * 1000
                                  return (
                                    <div key={`${session.key}:${session.updatedAt}`} className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                            <span className={`text-xs font-semibold ${isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                                              {isActive ? 'ACTIVE' : 'IDLE'}
                                            </span>
                                            <span className="text-slate-300 text-sm">{session.kind}</span>
                                            <span className="text-slate-500 text-xs">{session.model || 'model:n/a'}</span>
                                          </div>
                                          <div className="text-slate-500 text-xs mt-1">
                                            key {session.key ? `${session.key.slice(0, 16)}${session.key.length > 16 ? '…' : ''}` : 'n/a'} •{' '}
                                            updated {isoToReadable(session.updatedAt)} • age {ageLabel(session.age)} • tokens{' '}
                                            {typeof session.totalTokens === 'number' ? session.totalTokens.toLocaleString() : 'n/a'} • used{' '}
                                            {typeof session.percentUsed === 'number' ? `${session.percentUsed}%` : 'n/a'}
                                          </div>
                                          {(session.flags.length > 0 || session.abortedLastRun) && (
                                            <div className="text-amber-300 text-xs mt-1">
                                              {session.abortedLastRun ? 'aborted last run' : 'flags'}{session.flags.length ? ` • ${session.flags.join(', ')}` : ''}
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => copySessionKey(session.key)}
                                          className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                                          title={session.key}
                                        >
                                          {copiedSessionKey === session.key ? 'Copied' : 'Copy key'}
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div className="flex items-center justify-between">
                        <div className="text-white font-semibold">Recent Activity</div>
                        <div className="text-slate-500 text-xs">{activityFeed?.lastUpdated ? `updated ${isoToReadable(activityFeed.lastUpdated)}` : ''}</div>
                      </div>
                      {!activityFeed ? (
                        <div className="text-slate-400 text-sm mt-3">No activity payload yet.</div>
                      ) : !activityFeed.available ? (
                        <div className="text-slate-400 text-sm mt-3">{activityFeed.reason}</div>
                      ) : (
                        <>
                          <div className="text-slate-500 text-xs mt-2">
                            {activityFeed.logs
                              .map((log) => `${log.id}:${log.exists ? `${log.lineCount} lines` : 'missing'}`)
                              .join(' • ')}
                          </div>
                          <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap overflow-x-auto">
                            {activityFeed.combinedTail ? pickRecentAlertLines(activityFeed.combinedTail, 80) : 'No recent lines'}
                          </pre>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* LOGS */}
              {activeTab === 'logs' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <div className="text-white font-semibold">Maintenance Log</div>
                    <div className="text-slate-400 text-xs mt-1">{maintenanceLog?.path}</div>
                    <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap overflow-x-auto">
                      {maintenanceLog
                        ? maintenanceLog.available
                          ? pickRecentAlertLines(maintenanceLog.tail, 25)
                          : maintenanceLog.reason
                        : 'No data yet'}
                    </pre>
                  </div>
                  <div className="card">
                    <div className="text-white font-semibold">Trader Log</div>
                    <div className="text-slate-400 text-xs mt-1">{traderLog?.path}</div>
                    <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap overflow-x-auto">
                      {traderLog
                        ? traderLog.available
                          ? pickRecentAlertLines(traderLog.tail, 25)
                          : traderLog.reason
                        : 'No data yet'}
                    </pre>
                  </div>
                </div>
              )}

              {/* USAGE */}
              {activeTab === 'usage' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="card">
                      <div className="text-white font-semibold">Window (5h)</div>
                      <div className="text-slate-500 text-xs mt-1">Estimated request volume</div>
                      {usageData && usageData.available ? (
                        <>
                          <div className="text-3xl font-bold mt-2">{usageData.window5h.requestCountApprox}</div>
                          <div className="text-slate-400 text-xs mt-2">Conservative limit view: 300 requests / 5h</div>
                          <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                            <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${usageSummary?.pct || 0}%` }} />
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-400 mt-2">Unavailable on this host</div>
                      )}
                    </div>
                    <div className="card">
                      <div className="text-white font-semibold">Window (7d)</div>
                      <div className="text-slate-500 text-xs mt-1">Estimated request volume</div>
                      {usageData && usageData.available ? (
                        <>
                          <div className="text-3xl font-bold mt-2">{usageData.window7d.requestCountApprox}</div>
                          <div className="text-slate-400 text-xs mt-2">Logs-driven estimate only</div>
                        </>
                      ) : (
                        <div className="text-slate-400 mt-2">Unavailable</div>
                      )}
                    </div>
                    <div className="card">
                      <div className="text-white font-semibold">Usage alerts</div>
                      <div className="mt-2 space-y-2">
                        {usageSummary?.alerts.length ?
                          usageSummary.alerts.map((a) => <div key={a.code} className="text-xs text-slate-200">• {a.message}</div>) :
                          <div className="text-slate-500 text-sm">No usage alerts</div>
                        }
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">Top models (5h)</div>
                    <div className="mt-3 space-y-2">
                      {usageSummary && usageSummary.topModels5h.length ? (
                        usageSummary.topModels5h.map(([model, count]) => (
                          <div key={model} className="text-slate-200 text-sm flex justify-between border-b border-slate-800 pb-2">
                            <span className="truncate pr-4">{model}</span>
                            <span className="text-slate-400">{count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 text-sm">No data yet</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DEBUG */}
              {activeTab === 'debug' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Truth / Debug</div>
                    <div className="text-slate-500 text-xs">raw sources (for auditing accuracy)</div>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">openclaw status --json</div>
                    <pre className="text-xs text-slate-300 mt-3 overflow-x-auto">{JSON.stringify(openclawStatus, null, 2)}</pre>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">openclaw cron list --json</div>
                    <pre className="text-xs text-slate-300 mt-3 overflow-x-auto">{JSON.stringify(cronList, null, 2)}</pre>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">openclaw models list --json</div>
                    <pre className="text-xs text-slate-300 mt-3 overflow-x-auto">{JSON.stringify(debugModels, null, 2)}</pre>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">openclaw setup (local openclaw.json, redacted)</div>
                    <pre className="text-xs text-slate-300 mt-3 overflow-x-auto">{JSON.stringify(debugSetup, null, 2)}</pre>
                  </div>
                </div>
              )}
            </main>

            <footer className="border-t border-slate-800 text-center text-slate-500 text-xs py-4">
              Mission Center • Local dashboard for Max&apos;s OpenClaw setup
            </footer>
          </div>
        </div>
      </div>
    </>
  )
}
