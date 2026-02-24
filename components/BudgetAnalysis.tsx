interface Recommendation {
  priority: 'high' | 'medium' | 'low'
  message: string
  savings: string
}

interface BudgetAnalysisProps {
  recommendations: Recommendation[]
  monthlySpend: number
  monthlyBudget?: number
}

export default function BudgetAnalysis({
  recommendations,
  monthlySpend,
  monthlyBudget = 100,
}: BudgetAnalysisProps) {
  const remaining = monthlyBudget - monthlySpend
  const percentUsed = (monthlySpend / monthlyBudget) * 100
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-900 border-red-700'
      case 'medium':
        return 'bg-yellow-900 border-yellow-700'
      default:
        return 'bg-blue-900 border-blue-700'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'HIGH'
      case 'medium':
        return 'MEDIUM'
      default:
        return 'LOW'
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-6">Budget Analysis</h2>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <p className="text-slate-400">Monthly Budget Usage</p>
          <p className="font-bold">${monthlySpend.toFixed(2)} / ${monthlyBudget.toFixed(2)}</p>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${
              percentUsed > 80
                ? 'bg-red-500'
                : percentUsed > 60
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        <p className="text-sm text-slate-400 mt-2">
          {remaining > 0
            ? `${remaining.toFixed(2)} remaining`
            : `${Math.abs(remaining).toFixed(2)} over budget`}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-300 mb-3">Recommendations</h3>
        {recommendations.map((rec, idx) => (
          <div key={idx} className={`p-3 rounded-lg border ${getPriorityColor(rec.priority)}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-200 mb-1">
                  {getPriorityLabel(rec.priority)} PRIORITY
                </p>
                <p className="text-sm">{rec.message}</p>
              </div>
              <p className="text-xs font-bold text-green-300 ml-2 whitespace-nowrap">
                {rec.savings}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
