import { useState, useEffect } from 'react'
import Head from 'next/head'
import StatusCard from '../components/StatusCard'
import AgentTable from '../components/AgentTable'
import UsageChart from '../components/UsageChart'
import CostBreakdown from '../components/CostBreakdown'
import BudgetAnalysis from '../components/BudgetAnalysis'

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
  }
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low'
    message: string
    savings: string
  }>
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'status' | 'usage' | 'budget'>('status')
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, usageRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/usage'),
        ])
        setStatusData(await statusRes.json())
        setUsageData(await usageRes.json())
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000) // Refresh every 10 seconds
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
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white">🚀 Mission Center</h1>
                <p className="text-slate-400 text-sm mt-1">OpenClaw Command & Control</p>
              </div>
              {statusData && (
                <div className="text-right">
                  <p className="text-sm text-slate-400">OpenClaw Status</p>
                  <p className={`text-lg font-bold ${statusData.openclaw.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                    {statusData.openclaw.status === 'active' ? '● ACTIVE' : '○ OFFLINE'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="bg-slate-900 border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex gap-4">
              {(['status', 'usage', 'budget'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`tab-button ${activeTab === tab ? 'active' : 'inactive'}`}
                >
                  {tab === 'status' && '📊 Status'}
                  {tab === 'usage' && '💾 API Usage'}
                  {tab === 'budget' && '💰 Budget Analysis'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* STATUS TAB */}
          {activeTab === 'status' && statusData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard
                  label="OpenClaw"
                  value={statusData.openclaw.status.toUpperCase()}
                  status={statusData.openclaw.status === 'active' ? 'active' : 'error'}
                />
                <StatusCard
                  label="Uptime"
                  value={statusData.openclaw.uptime}
                  status="active"
                />
                <StatusCard
                  label="Active Agents"
                  value={statusData.agents.filter((a) => a.status === 'active').length}
                  status="active"
                />
                <StatusCard
                  label="Total Tasks"
                  value={statusData.agents.reduce((sum, a) => sum + a.tasksCompleted, 0)}
                  status="active"
                />
              </div>

              <AgentTable agents={statusData.agents} />
            </div>
          )}

          {/* USAGE TAB */}
          {activeTab === 'usage' && usageData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard
                  label="Total Cost"
                  value={`$${usageData.summary.totalCostUSD.toFixed(2)}`}
                />
                <StatusCard
                  label="Total Requests"
                  value={usageData.summary.totalRequests}
                />
                <StatusCard
                  label="Tokens Used"
                  value={`${(usageData.summary.totalTokensUsed / 1000).toFixed(1)}K`}
                />
                <StatusCard
                  label="Avg Cost/Request"
                  value={`$${usageData.summary.avgCostPerRequest.toFixed(2)}`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <UsageChart
                  data={usageData.models.map((m) => ({
                    name: m.name,
                    value: m.tokensUsed,
                    cost: m.costUSD,
                  }))}
                />
                <CostBreakdown
                  models={usageData.models}
                  totalCost={usageData.summary.totalCostUSD}
                />
              </div>
            </div>
          )}

          {/* BUDGET TAB */}
          {activeTab === 'budget' && usageData && (
            <div className="space-y-6">
              <BudgetAnalysis
                monthlySpend={usageData.summary.totalCostUSD}
                monthlyBudget={500}
                recommendations={usageData.recommendations}
              />

              <CostBreakdown
                models={usageData.models}
                totalCost={usageData.summary.totalCostUSD}
              />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-800 mt-12">
          <div className="max-w-7xl mx-auto px-6 py-6 text-center text-slate-400 text-sm">
            <p>Mission Center v1.0.0 • Last updated: {new Date().toLocaleString()}</p>
          </div>
        </footer>
      </div>
    </>
  )
}
