import type { NextApiRequest, NextApiResponse } from 'next'

// Your actual current spending (as of 2026-02-24)
const ACTUAL_USAGE = {
  totalCostUSD: 15.20,
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
      costUSD: 8.50,
      requests: 232,
      avgCostPerRequest: 0.037,
    },
    {
      name: 'anthropic/claude-sonnet-4.6',
      provider: 'openrouter',
      tokensUsed: 45000,
      costUSD: 4.20,
      requests: 24,
      avgCostPerRequest: 0.175,
    },
    {
      name: 'google/gemini-2.0-flash',
      provider: 'openrouter',
      tokensUsed: 85000,
      costUSD: 2.50,
      requests: 11,
      avgCostPerRequest: 0.227,
    },
  ],
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const monthlyBudget = 100
  const totalCostUSD = ACTUAL_USAGE.totalCostUSD
  const models = ACTUAL_USAGE.models
  const totalRequests = ACTUAL_USAGE.totalRequests

  // Generate recommendations
  const recommendations = []

  if (totalCostUSD > monthlyBudget * 0.8) {
    recommendations.push({
      priority: 'high',
      message: `You're at ${((totalCostUSD / monthlyBudget) * 100).toFixed(1)}% of your $${monthlyBudget} budget. Consider reducing API usage.`,
      savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining`,
    })
  } else if (totalCostUSD > monthlyBudget * 0.5) {
    recommendations.push({
      priority: 'medium',
      message: 'Monitor usage closely to stay within budget',
      savings: `Budget allows $${(monthlyBudget - totalCostUSD).toFixed(2)} more`,
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
      totalTokensUsed: models.reduce((sum, m) => sum + m.tokensUsed, 0),
      avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCostUSD / totalRequests).toFixed(2)) : 0,
      monthlyBudget,
      remainingBudget: parseFloat((monthlyBudget - totalCostUSD).toFixed(2)),
      percentUsed: parseFloat(((totalCostUSD / monthlyBudget) * 100).toFixed(1)),
    },
    recommendations,
  })
}
