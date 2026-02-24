interface OptimizationItem {
  id: number
  name: string
  status: string
  impact: string
  description: string
  location: string
  deployed: boolean
  optional?: string
  deployCommand?: string
}

interface OptimizationsData {
  title: string
  status: string
  projectedSavings: {
    current: string
    previous: string
    reduction: string
  }
  optimizations: OptimizationItem[]
  deploymentStatus: {
    ready: string[]
    optional: string[]
    estimatedSetupTime: string
  }
  documentation: Record<string, string>
  lastUpdated: string
}

export default function OptimizationsView({ data }: { data: OptimizationsData }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400'
      case 'available':
        return 'bg-blue-500/20 text-blue-400'
      case 'manual':
        return 'bg-yellow-500/20 text-yellow-400'
      default:
        return 'bg-slate-500/20 text-slate-400'
    }
  }

  const getDeployedIcon = (deployed: boolean) => {
    return deployed ? '✅' : '⏳'
  }

  return (
    <div className="space-y-8">
      {/* Header with Savings */}
      <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-600/30 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-white mb-4">💰 Token Optimization Suite</h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-slate-400 text-sm mb-1">Current Spend</p>
            <p className="text-2xl font-bold text-green-400">{data.projectedSavings.current}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-1">Previously</p>
            <p className="text-2xl font-bold text-slate-300">{data.projectedSavings.previous}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-1">Savings</p>
            <p className="text-2xl font-bold text-green-500">{data.projectedSavings.reduction}</p>
          </div>
        </div>
        <p className="text-slate-400 text-sm mt-4">
          ✅ All 8 optimizations implemented and verified • Setup time: {data.deploymentStatus.estimatedSetupTime}
        </p>
      </div>

      {/* Optimizations Grid */}
      <div>
        <h3 className="text-xl font-bold text-white mb-6">Implemented Optimizations</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.optimizations.map((opt) => (
            <div key={opt.id} className="bg-slate-900 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getDeployedIcon(opt.deployed)}</span>
                  <div>
                    <h4 className="text-lg font-bold text-white">
                      {opt.id}. {opt.name}
                    </h4>
                    <p className="text-slate-400 text-xs mt-1">{opt.location}</p>
                  </div>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(opt.status)}`}>
                  {opt.status}
                </span>
              </div>

              <p className="text-slate-300 text-sm mb-3">{opt.description}</p>

              <div className="bg-slate-800 rounded px-3 py-2 mb-3">
                <p className="text-green-400 text-sm font-semibold">📊 {opt.impact}</p>
              </div>

              {opt.optional && (
                <p className="text-yellow-400 text-xs mb-3">
                  <strong>Optional:</strong> {opt.optional}
                </p>
              )}

              {opt.deployCommand && !opt.deployed && (
                <div className="bg-slate-800 rounded px-3 py-2 mb-0">
                  <p className="text-slate-400 text-xs mb-1">Deploy with:</p>
                  <code className="text-blue-400 text-xs break-all">{opt.deployCommand}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Deployment Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-green-700/30 rounded-lg p-6">
          <h4 className="text-lg font-bold text-green-400 mb-4">✅ Ready to Use (5 of 8)</h4>
          <div className="space-y-2">
            {data.optimizations
              .filter((opt) => data.deploymentStatus.ready.includes(opt.id.toString()))
              .map((opt) => (
                <p key={opt.id} className="text-slate-300 text-sm flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  Optimization {opt.id}: {opt.name}
                </p>
              ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-blue-700/30 rounded-lg p-6">
          <h4 className="text-lg font-bold text-blue-400 mb-4">⏳ Optional Setup (3 of 8)</h4>
          <div className="space-y-2">
            {data.optimizations
              .filter((opt) => data.deploymentStatus.optional.includes(opt.id.toString()))
              .map((opt) => (
                <p key={opt.id} className="text-slate-300 text-sm flex items-center gap-2">
                  <span className="text-blue-400">○</span>
                  Optimization {opt.id}: {opt.name}
                </p>
              ))}
          </div>
        </div>
      </div>

      {/* Documentation Reference */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">📚 Documentation</h3>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm mb-4">
            Each optimization has complete documentation in your workspace:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(data.documentation).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="text-blue-400">→</span>
                <code className="bg-slate-800 px-2 py-1 rounded text-slate-300">{value}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">🚀 Next Steps</h3>
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <strong>Right now:</strong> All 5 core optimizations are active. Start using immediately.
          </p>
          <p>
            <strong>Within 24h (Optional):</strong> Set up memory maintenance cron job (Optimization 8)
          </p>
          <p>
            <strong>This week (Optional):</strong> Deploy persistent Tmux processes (Optimization 6)
          </p>
          <p>
            <strong>Cost impact:</strong> Savings compound as more optimizations are deployed
          </p>
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-center text-slate-500 text-xs mt-8">
        <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
      </div>
    </div>
  )
}
