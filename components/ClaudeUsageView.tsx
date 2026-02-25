interface ClaudeModel {
  model: string
  cost: number
  tokens: number
  requests: number
}

interface ClaudeUsageData {
  subscription: {
    tier: string
    status: string
  }
  key: {
    type: string
    last4: string
    status: string
    configured: boolean
  }
  limits: {
    dailyTokens: string
    monthlyTokens: string
    note: string
  }
  usage: {
    totalCost: number
    totalTokens: number
    totalRequests: number
    models: ClaudeModel[]
    source: string
  }
}

interface ClaudeUsageViewProps {
  data: ClaudeUsageData
}

export default function ClaudeUsageView({ data }: ClaudeUsageViewProps) {
  const isActive = data.subscription.status === 'active'
  const statusColor = isActive ? 'text-green-400' : 'text-red-400'
  const statusDot = isActive ? '●' : '○'

  return (
    <div className="space-y-6">
      {/* Top Row: Subscription + Key Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subscription Card */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Subscription</h2>
            <span className={`text-2xl ${statusColor}`}>{statusDot}</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Tier</span>
              <span className="font-bold text-purple-400">{data.subscription.tier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <span className={`font-semibold ${statusColor}`}>
                {data.subscription.status.charAt(0).toUpperCase() + data.subscription.status.slice(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Daily Limit</span>
              <span className="text-sm">{data.limits.dailyTokens}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Monthly Limit</span>
              <span className="text-sm">{data.limits.monthlyTokens}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-500">{data.limits.note}</p>
          </div>
        </div>

        {/* Key Info Card */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">API Key</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Type</span>
              <span className="font-semibold text-blue-400">{data.key.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Key</span>
              <span className="font-mono text-slate-300">sk-ant-•••{data.key.last4}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status</span>
              <span className={`font-semibold ${
                data.key.status === 'active' ? 'text-green-400' :
                data.key.status.includes('active') ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {data.key.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Configured</span>
              <span className={data.key.configured ? 'text-green-400' : 'text-red-400'}>
                {data.key.configured ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Total Spend (via OpenRouter)</p>
          <p className="text-3xl font-bold text-green-400 mt-2">${data.usage.totalCost.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Total Tokens</p>
          <p className="text-3xl font-bold mt-2">{(data.usage.totalTokens / 1000).toFixed(1)}K</p>
        </div>
        <div className="card text-center">
          <p className="text-slate-400 text-sm">Total Requests</p>
          <p className="text-3xl font-bold mt-2">{data.usage.totalRequests}</p>
        </div>
      </div>

      {/* Model Breakdown */}
      {data.usage.models.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Claude Model Breakdown</h2>
          <div className="space-y-4">
            {data.usage.models.map((model) => {
              const pct = data.usage.totalCost > 0
                ? (model.cost / data.usage.totalCost) * 100
                : 0

              // Color based on model name
              const barColor = model.model.includes('haiku')
                ? 'from-emerald-500 to-teal-500'
                : model.model.includes('sonnet')
                ? 'from-blue-500 to-indigo-500'
                : model.model.includes('opus')
                ? 'from-purple-500 to-pink-500'
                : 'from-slate-500 to-slate-400'

              return (
                <div key={model.model}>
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="font-semibold">{model.model}</p>
                      <p className="text-xs text-slate-400">
                        {model.requests} requests · {model.tokens.toLocaleString()} tokens
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">${model.cost.toFixed(2)}</p>
                      <p className="text-xs text-slate-400">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className={`bg-gradient-to-r ${barColor} h-2 rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div className="card bg-slate-900 border-slate-800">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="text-sm text-slate-400">
              Usage tracked via OpenRouter proxy. For direct Anthropic billing and subscription management,
              visit{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                console.anthropic.com
              </a>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Data source: {data.usage.source}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
