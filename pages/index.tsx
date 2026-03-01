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

function msToIso(ms?: number): string {
  if (!ms) return 'n/a'
  return new Date(ms).toISOString()
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
  const [debugSetup, setDebugSetup] = useState<AnyJson | null>(null)
  const [debugModels, setDebugModels] = useState<AnyJson | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [maintenanceLog, setMaintenanceLog] = useState<LogData | null>(null)
  const [traderLog, setTraderLog] = useState<LogData | null>(null)

  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [taskDetails, setTaskDetails] = useState<TaskDetailsData | null>(null)
  const [taskDetailsLoading, setTaskDetailsLoading] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [cronRuns, setCronRuns] = useState<CronRunsData | null>(null)

  const [loading, setLoading] = useState(true)

  const safeFetchJson = async (url: string) => {
    const response = await fetch(url)
    return response.json()
  }

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [alertsRes, tasksRes, cronRes, statusRes, setupRes, modelsRes, usageRes, maintRes, traderRes] = await Promise.all([
          safeFetchJson('/api/alerts'),
          // sync=1: best-effort orchestrator check, throttled server-side
          safeFetchJson(`/api/tasks/list?sync=1&project=${encodeURIComponent(selectedProject)}`),
          safeFetchJson('/api/cron/list'),
          safeFetchJson('/api/status'),
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
  }, [selectedProject])

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

    if (alertsData && alertsData.available) {
      for (const a of alertsData.alerts || []) {
        if (a?.project) set.add(a.project)
      }
    }

    return ['all', ...Array.from(set).sort()]
  }, [cronList, tasksList, alertsData])

  useEffect(() => {
    if (selectedProject === 'all') return
    if (!projectOptions.includes(selectedProject)) {
      setSelectedProject('all')
    }
  }, [projectOptions, selectedProject])

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetails(null)
      setTaskDetailsLoading(false)
      return
    }

    let cancelled = false

    const fetchTaskDetails = async () => {
      setTaskDetailsLoading(true)
      try {
        const res = await fetch(`/api/tasks/details?id=${encodeURIComponent(selectedTaskId)}`)
        const data = await res.json()
        if (!cancelled) setTaskDetails(data)
      } catch (_err) {
        if (!cancelled) {
          setTaskDetails({
            dataSource: 'clawdbot_task_details',
            available: false,
            reason: 'Failed to load task details.',
            lastUpdated: new Date().toISOString(),
          })
        }
      } finally {
        if (!cancelled) setTaskDetailsLoading(false)
      }
    }

    fetchTaskDetails()
    const interval = setInterval(fetchTaskDetails, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selectedTaskId])

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

  useEffect(() => {
    if (!selectedTaskId) return
    if (!filteredTasks.some((task: any) => task?.id === selectedTaskId)) {
      setSelectedTaskId('')
    }
  }, [filteredTasks, selectedTaskId])

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

              {/* TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Tasks</div>
                    <div className="text-slate-500 text-xs">board auto-refreshes • status derives from .clawdbot • click a task for details</div>
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
                              <button
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="w-full text-left bg-slate-950/40 border border-slate-700 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-400 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Running</div>
                          <div className="text-slate-500 text-xs mt-1">active work</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.running.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.running.map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="w-full text-left bg-slate-950/40 border border-blue-800 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-slate-400 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                                {t.branch && <div className="text-slate-500 text-xs mt-1">branch: {t.branch}</div>}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Needs attention</div>
                          <div className="text-slate-500 text-xs mt-1">blocked / failing gate</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.needsAttention.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.needsAttention.map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="w-full text-left bg-slate-950/40 border border-rose-800 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-rose-200 text-xs mt-1">{t.projectId || 'no-project'} • {t.agent || 'agent?'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Done</div>
                          <div className="text-slate-500 text-xs mt-1">ready / completed</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.done.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.done.map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="w-full text-left bg-slate-950/40 border border-emerald-800 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-emerald-200 text-xs mt-1">{t.projectId || 'no-project'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="card">
                          <div className="text-white font-semibold">Failed</div>
                          <div className="text-slate-500 text-xs mt-1">gave up / max attempts</div>
                          <div className="mt-4 space-y-3">
                            {taskBuckets.failed.length === 0 && <div className="text-slate-400 text-sm">None</div>}
                            {taskBuckets.failed.map((t: any) => (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="w-full text-left bg-slate-950/40 border border-rose-900 rounded-lg p-3 hover:bg-slate-950/70"
                              >
                                <div className="text-slate-100 font-medium">{t.description || t.id}</div>
                                <div className="text-rose-200 text-xs mt-1">{t.projectId || 'no-project'} • {msToRelative(t.updatedAt || t.createdAt)}</div>
                              </button>
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

                      {selectedTaskId && (
                        <div
                          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm p-4 md:p-6"
                          onClick={() => setSelectedTaskId('')}
                        >
                          <div
                            className="mx-auto w-full max-w-4xl max-h-full overflow-hidden bg-slate-900 border border-slate-700 rounded-xl"
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

                            <div className="p-4 overflow-y-auto max-h-[75vh]">
                              {taskDetailsLoading && <div className="text-slate-400 text-sm">Loading details...</div>}

                              {!taskDetailsLoading && !taskDetails && (
                                <div className="text-slate-400 text-sm">No task details payload.</div>
                              )}

                              {!taskDetailsLoading && taskDetails && !taskDetails.available && (
                                <div className="text-rose-200 text-sm">{taskDetails.reason}</div>
                              )}

                              {!taskDetailsLoading && taskDetails && taskDetails.available && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">projectId</div>
                                      <div className="text-slate-100 mt-1 break-all">{taskDetails.task.projectId || 'n/a'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">agent</div>
                                      <div className="text-slate-100 mt-1">{taskDetails.task.agent || 'n/a'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">status</div>
                                      <div className="text-slate-100 mt-1">{taskDetails.task.status || 'unknown'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">updatedAt</div>
                                      <div className="text-slate-100 mt-1">
                                        {msToIso(taskDetails.task.updatedAt)} ({msToRelative(taskDetails.task.updatedAt || taskDetails.task.createdAt)})
                                      </div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">branch</div>
                                      <div className="text-slate-100 mt-1 break-all">{taskDetails.task.branch || 'n/a'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">worktree</div>
                                      <div className="text-slate-100 mt-1 break-all">{taskDetails.task.worktree || 'n/a'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">tmuxSession</div>
                                      <div className="text-slate-100 mt-1 break-all">{taskDetails.task.tmuxSession || 'n/a'}</div>
                                    </div>
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3">
                                      <div className="text-slate-500 text-xs">attempts / maxAttempts</div>
                                      <div className="text-slate-100 mt-1">
                                        {taskDetails.task.attempts ?? 0} / {taskDetails.task.maxAttempts ?? '?'}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="card">
                                    <div className="text-white font-semibold">Session log tail</div>
                                    {taskDetails.log.available ? (
                                      <>
                                        <div className="text-slate-500 text-xs mt-1">{taskDetails.log.path}</div>
                                        <pre className="text-xs text-slate-200 mt-3 whitespace-pre-wrap overflow-x-auto">{taskDetails.log.tail || '(log is empty)'}</pre>
                                      </>
                                    ) : (
                                      <div className="text-slate-400 text-sm mt-2">no log available</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
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
