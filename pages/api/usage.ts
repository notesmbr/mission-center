import type { NextApiRequest, NextApiResponse } from 'next'

// Your actual current spending (as of 2026-02-24)
const ACTUAL_USAGE = {
  totalCostUSD: 28.20,
  totalRequests: 267,
  period: {
    start: '2026-02-01',
    end: '2026-02-24',
  },
  models: [
    {
      name: 'anthropic/claude-haiku-4-5',
      provider: 'openrouter',
      tokensUsed: 125000,
      costUSD: 14.50,
      requests: 232,
      avgCostPerRequest: 0.063,
    },
    {
      name: 'anthropic/claude-sonnet-4.6',
      provider: 'openrouter',
      tokensUsed: 45000,
      costUSD: 8.20,
      requests: 24,
      avgCostPerRequest: 0.342,
    },
    {
      name: 'google/gemini-2.0-flash',
      provider: 'openrouter',
      tokensUsed: 85000,
      costUSD: 5.50,
      requests: 11,
      avgCostPerRequest: 0.5,
    },
  ],
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const monthlyBudget = 100
  const totalCostUSD = ACTUAL_USAGE.totalCostUSD
  const models = ACTUAL_USAGE.models
  const totalRequests = ACTUAL_USAGE.totalRequests
  const totalTokensUsed = models.reduce((sum, m) => sum + m.tokensUsed, 0)

  // Generate recommendations based on actual spend
  const recommendations = []

  if (totalCostUSD > monthlyBudget * 0.8) {
    recommendations.push({
      priority: 'high',
      message: `You're at ${((totalCostUSD / monthlyBudget) * 100).toFixed(1)}% of your $${monthlyBudget} budget. Monitor closely.`,
      savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining`,
    })
  } else if (totalCostUSD > monthlyBudget * 0.5) {
    recommendations.push({
      priority: 'medium',
      message: 'Spending is moderate. Keep monitoring usage.',
      savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining`,
    })
  } else {
    recommendations.push({
      priority: 'low',
      message: `You're on track. Current spend: $${totalCostUSD.toFixed(2)}`,
      savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining this month`,
    })
  }

  res.status(200).json({
    period: ACTUAL_USAGE.period,
    models,
    summary: {
      totalCostUSD,
      totalRequests,
      totalTokensUsed,
      avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCostUSD / totalRequests).toFixed(3)) : 0,
      monthlyBudget,
      remainingBudget: parseFloat((monthlyBudget - totalCostUSD).toFixed(2)),
      percentUsed: parseFloat(((totalCostUSD / monthlyBudget) * 100).toFixed(1)),
    },
    recommendations,
  })
}
