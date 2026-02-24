interface Model {
  name: string
  provider: string
  costUSD: number
  tokensUsed: number
  requests: number
  avgCostPerRequest: number
}

interface CostBreakdownProps {
  models: Model[]
  totalCost: number
}

export default function CostBreakdown({ models, totalCost }: CostBreakdownProps) {
  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Cost Breakdown by Model</h2>
      <div className="space-y-3">
        {models.map((model) => {
          const percentage = (model.costUSD / totalCost) * 100
          return (
            <div key={model.name}>
              <div className="flex justify-between items-center mb-2">
                <div>
                  <p className="font-semibold">{model.name}</p>
                  <p className="text-xs text-slate-400">
                    {model.requests} requests • {model.tokensUsed.toLocaleString()} tokens
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-400">${model.costUSD.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">{percentage.toFixed(1)}%</p>
                </div>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-6 pt-6 border-t border-slate-700">
        <div className="flex justify-between items-center">
          <p className="text-lg font-semibold">Total Cost</p>
          <p className="text-2xl font-bold text-green-400">${totalCost.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}
