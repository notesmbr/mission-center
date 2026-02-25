import { useState, useEffect } from 'react'
import Head from 'next/head'
import StatusCard from '../components/StatusCard'
import AgentTable from '../components/AgentTable'
import UsageChart from '../components/UsageChart'
import CostBreakdown from '../components/CostBreakdown'
import BudgetAnalysis from '../components/BudgetAnalysis'
import PermissionsView from '../components/PermissionsView'
import OptimizationsView from '../components/OptimizationsView'
import ClaudeUsageView from '../components/ClaudeUsageView'
import Sidebar, { type NavKey } from '../components/Sidebar'
import AccuracyBadge from '../components/AccuracyBadge'

interface StatusData {
  openclaw: { status: string; uptime: string; lastHeartbeat: string }
  agents: Array<{ id: string; name: string; model: string; status: 'active' | 'idle' | 'error'; tasksCompleted: number }>
}

interface UsageData {
  period: { start: string; end: string }
  models: Array<{
    name: string
    provider: string
    tokensUsed: number
    costUSD: number
    requests: number
    avgCostPerRequest: number
  }>
  summary: {
    totalCostUSD: number
    totalRequests: number
    totalTokensUsed: number
    avgCostPerRequest: number
    monthlyBudget?: number
    remainingBudget?: number
    percentUsed?: number
  }
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low'
    message: string
    savings: string
  }>
}

interface HomeProps {
  signOut?: () => void
}

export default function Home({ signOut }: HomeProps) {
  const [activeTab, setActiveTab] = useState<NavKey>('overview')
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [claudeData, setClaudeData] = useState<any>(null)
  const [permissionsData, setPermissionsData] = useState<any>(null)
  const [optimizationsData, setOptimizationsData] = useState<any>(null)
  const [setupData, setSetupData] = useState<any>(null)
  const [openclawUsage, setOpenclawUsage] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, usageRes, claudeRes, permRes, optRes, setupRes, ocUsageRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/usage'),
          fetch('/api/claude-usage'),
          fetch('/api/permissions'),
          fetch('/api/optimizations'),
          fetch('/api/openclaw-setup'),
          fetch('/api/openclaw-usage'),
        ])
        setStatusData(await statusRes.json())
        setUsageData(await usageRes.json())
        setClaudeData(await claudeRes.json())
        setPermissionsData(await permRes.json())
        setOptimizationsData(await optRes.json())
        setSetupData(await setupRes.json())
        setOpenclawUsage(await ocUsageRes.json())
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <p className="text-4xl">⚙️</p>
          </div>
          <p className="text-slate-400">Loading Mission Center...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Mission Center - OpenClaw Command</title>
        <meta name="description" content="OpenClaw Mission Control Dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950">
        <div className="flex min-h-screen">
          <Sidebar active={activeTab} onChange={setActiveTab} />

          <div className="flex-1">
            {/* Top bar */}
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-white text-xl font-semibold tracking-wide">Mission Control</div>
                  <div className="text-slate-400 text-xs mt-0.5">OpenClaw • status & usage • read-only</div>
                </div>

                <div className="flex items-center gap-4">
                  {statusData && (
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">OpenClaw</div>
                      <div className={`text-sm font-semibold ${statusData.openclaw.status === 'active' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {statusData.openclaw.status === 'active' ? 'ACTIVE' : 'OFFLINE'}
                      </div>
                    </div>
                  )}
                  {signOut && (
                    <button
                      onClick={signOut}
                      className="text-slate-400 hover:text-slate-200 text-xs border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-2 transition-colors"
                      title="Sign out"
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            </header>

            {/* Content */}
            <main className="px-6 py-6">
              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Overview</div>
                    <AccuracyBadge level={setupData?.available ? 'live' : 'unknown'} />
                  </div>

                  {setupData?.available && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatusCard label="Default Model" value={setupData.summary?.defaultModel || 'Unknown'} />
                      <StatusCard label="Thinking" value={setupData.summary?.thinkingDefault || 'Unknown'} />
                      <StatusCard label="Gateway" value={`${setupData.summary?.gateway?.mode || '?'} / ${setupData.summary?.gateway?.bind || '?'}`} />
                      <StatusCard label="Web Search" value={setupData.summary?.webSearchProvider || 'Unknown'} />
                    </div>
                  )}

                  {openclawUsage?.available && (
                    <div className="card">
                      <div className="flex items-center justify-between">
                        <div className="text-white font-semibold">Codex OAuth Usage (estimated)</div>
                        <AccuracyBadge level="derived" />
                      </div>
                      <div className="mt-3 text-sm text-slate-300">
                        5h window: ~{openclawUsage.window5h.requestCountApprox} request(s) • 7d window: ~{openclawUsage.window7d.requestCountApprox} request(s)
                      </div>
                      <div className="mt-2 space-y-1">
                        {(openclawUsage.alerts || []).slice(0, 2).map((a: any, idx: number) => (
                          <div key={idx} className={`text-xs ${a.level === 'critical' ? 'text-rose-300' : a.level === 'warn' ? 'text-amber-300' : 'text-slate-400'}`}>
                            {a.level.toUpperCase()}: {a.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!setupData?.available && (
                    <div className="card">
                      <div className="text-white font-semibold">Live setup unavailable</div>
                      <div className="text-slate-400 text-sm mt-1">{setupData?.reason || 'No details.'}</div>
                    </div>
                  )}
                </div>
              )}

              {/* SETUP */}
              {activeTab === 'setup' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">OpenClaw Setup</div>
                    <AccuracyBadge level={setupData?.available ? 'live' : 'unknown'} />
                  </div>
                  <div className="card">
                    <pre className="text-xs text-slate-300 overflow-x-auto">{JSON.stringify(setupData, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* AGENTS */}
              {activeTab === 'agents' && statusData && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Agents</div>
                    <AccuracyBadge level="hardcoded" />
                  </div>
                  <div className="card">
                    <div className="text-slate-400 text-sm mb-4">
                      This section will be updated next to reflect live OpenClaw agent lanes instead of the legacy hardcoded list.
                    </div>
                    <AgentTable agents={statusData.agents} />
                  </div>
                </div>
              )}

              {/* USAGE */}
              {activeTab === 'usage' && usageData && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Usage</div>
                    <AccuracyBadge level={(usageData as any).dataSource === 'live' ? 'live' : 'hardcoded'} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatusCard label="Total Cost" value={`$${usageData.summary.totalCostUSD.toFixed(2)}`} />
                    <StatusCard label="Total Requests" value={usageData.summary.totalRequests} />
                    <StatusCard label="Tokens Used" value={`${(usageData.summary.totalTokensUsed / 1000).toFixed(1)}K`} />
                    <StatusCard label="Avg Cost/Request" value={`$${usageData.summary.avgCostPerRequest.toFixed(2)}`} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <UsageChart
                      data={usageData.models.map((m) => ({
                        name: m.name,
                        value: m.tokensUsed,
                        cost: m.costUSD,
                      }))}
                    />
                    <CostBreakdown models={usageData.models} totalCost={usageData.summary.totalCostUSD} />
                  </div>
                </div>
              )}

              {/* CODEX */}
              {activeTab === 'codex' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Codex OAuth Limits</div>
                    <AccuracyBadge level={openclawUsage?.available ? 'derived' : 'unknown'} />
                  </div>
                  <div className="card">
                    <pre className="text-xs text-slate-300 overflow-x-auto">{JSON.stringify(openclawUsage, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* SKILLS */}
              {activeTab === 'skills' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Skills & Capabilities</div>
                    <AccuracyBadge level="derived" />
                  </div>
                  <div className="card">
                    <div className="text-slate-300 text-sm">
                      Coming next: installed skills, skills in-use, Brave search, and browser relay capability.
                    </div>
                  </div>
                </div>
              )}

              {/* AUTOMATIONS */}
              {activeTab === 'automations' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Automations</div>
                    <AccuracyBadge level="derived" />
                  </div>
                  <div className="card">
                    <div className="text-slate-300 text-sm">
                      Coming next: list cron jobs from local jobs.json (Smart Trader, nightly maintenance, etc.).
                    </div>
                  </div>
                </div>
              )}

              {/* OPTIMIZATIONS */}
              {activeTab === 'optimizations' && optimizationsData && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-lg font-semibold">Optimizations</div>
                    <AccuracyBadge level="hardcoded" />
                  </div>
                  <OptimizationsView data={optimizationsData} />
                </div>
              )}

              {/* Legacy panels kept for now */}
              {activeTab === 'optimizations' && permissionsData && null}
              {activeTab === 'optimizations' && claudeData && null}
            </main>

            <footer className="border-t border-slate-800 text-center text-slate-500 text-xs py-4">
              Mission Center • refreshes every 10s
            </footer>
          </div>
        </div>
      </div>
    </>
  )
}
