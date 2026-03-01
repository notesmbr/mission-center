import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Sidebar, { type NavKey } from '../components/Sidebar'

type AlertsData =
  | { dataSource: 'derived'; available: true; alerts: any[]; lastUpdated: string }
  | { dataSource: 'derived'; available: false; reason: string; lastUpdated: string }

type CronListData =
  | { dataSource: 'openclaw_cron_list'; available: true; jobs: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_list'; available: false; reason: string; lastUpdated: string }

type CronRunsData =
  | { dataSource: 'openclaw_cron_runs'; available: true; entries: any[]; lastUpdated: string }
  | { dataSource: 'openclaw_cron_runs'; available: false; reason: string; lastUpdated: string }

type AnyJson = any

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavKey>('alerts')

  const [alertsData, setAlertsData] = useState<AlertsData | null>(null)
  const [cronList, setCronList] = useState<CronListData | null>(null)

  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [cronRuns, setCronRuns] = useState<CronRunsData | null>(null)

  // Debug payloads (raw truth)
  const [debugStatus, setDebugStatus] = useState<AnyJson | null>(null)
  const [debugSetup, setDebugSetup] = useState<AnyJson | null>(null)
  const [debugModels, setDebugModels] = useState<AnyJson | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [alertsRes, cronRes, statusRes, setupRes, modelsRes] = await Promise.all([
          fetch('/api/alerts'),
          fetch('/api/cron/list'),
          fetch('/api/status'),
          fetch('/api/openclaw-setup'),
          fetch('/api/models/list'),
        ])

        setAlertsData(await alertsRes.json())
        setCronList(await cronRes.json())
        setDebugStatus(await statusRes.json())
        setDebugSetup(await setupRes.json())
        setDebugModels(await modelsRes.json())
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
    for (const j of jobs) {
      const tag = parseProjectTag(j?.name)
      if (tag) set.add(tag)
    }
    return ['all', ...Array.from(set).sort()]
  }, [cronList])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-300">Loading Samoas Control</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Samoas Control</title>
        <meta name="description" content="Samoas Control local OpenClaw dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950">
        <div className="flex flex-col md:flex-row min-h-screen">
          <Sidebar active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 min-w-0">
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
              <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-white text-lg md:text-xl font-semibold tracking-wide truncate">Samoas Control</div>
                  <div className="text-slate-400 text-xs mt-0.5 truncate">Alert inbox  only things that need Max</div>
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
                              <div className={
                                'text-xs font-semibold px-2 py-1 rounded ' +
                                (a.severity === 'error' ? 'bg-rose-900/60 text-rose-200 border border-rose-800' : 'bg-amber-900/60 text-amber-200 border border-amber-800')
                              }>
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

              {/* DEBUG */}
              {activeTab === 'debug' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Truth / Debug</div>
                    <div className="text-slate-500 text-xs">raw sources (for auditing accuracy)</div>
                  </div>

                  <div className="card">
                    <div className="text-white font-semibold">openclaw status --json</div>
                    <pre className="text-xs text-slate-300 mt-3 overflow-x-auto">{JSON.stringify(debugStatus, null, 2)}</pre>
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
              Samoas Control  alert inbox + project-scoped jobs
            </footer>
          </div>
        </div>
      </div>
    </>
  )
}
