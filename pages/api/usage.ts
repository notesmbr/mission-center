import type { NextApiRequest, NextApiResponse } from 'next'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const MONTHLY_BUDGET = 100

interface OpenRouterCreditsResponse {
  data: {
    label: string
    usage: number
    usage_daily: number
    usage_weekly: number
    usage_monthly: number
    limit: number
    limit_remaining: number
    total_credits: number
    total_usage: number
  }
}

// Fallback static data (last known accurate values) if API fails
const FALLBACK_DATA = {
  totalCostUSD: 32.91,
  totalRequests: 267,
  period: {
    start: '2026-02-01',
    end: new Date().toISOString().split('T')[0],
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
      costUSD: 13.21,
      requests: 24,
      avgCostPerRequest: 0.55,
    },
    {
      name: 'google/gemini-2.0-flash',
      provider: 'openrouter',
      tokensUsed: 85000,
      costUSD: 5.20,
      requests: 11,
      avgCostPerRequest: 0.47,
    },
  ],
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set cache-busting headers so Railway/CDN doesn't cache stale data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  let totalCostUSD = FALLBACK_DATA.totalCostUSD
  let dataSource = 'fallback'
  let creditData: OpenRouterCreditsResponse['data'] | null = null

  // Try to fetch real live data from OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        // 5 second timeout
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const json: OpenRouterCreditsResponse = await response.json()
        creditData = json.data
        // total_usage is the actual lifetime spend in USD
        totalCostUSD = creditData.total_usage
        dataSource = 'live'
      }
    } catch (err) {
      console.error('[usage] OpenRouter API fetch failed, using fallback:', err)
    }
  }

  // Build model breakdown (use fallback model data, scaled to match real total if we have live data)
  const models = FALLBACK_DATA.models
  const fallbackTotal = models.reduce((sum, m) => sum + m.costUSD, 0)
  const scaleFactor = fallbackTotal > 0 ? totalCostUSD / fallbackTotal : 1

  const scaledModels = models.map((m) => ({
    ...m,
    costUSD: parseFloat((m.costUSD * scaleFactor).toFixed(2)),
  }))

  const totalRequests = FALLBACK_DATA.totalRequests
  const totalTokensUsed = models.reduce((sum, m) => sum + m.tokensUsed, 0)

  // Build recommendations
  const recommendations = []
  const pct = (totalCostUSD / MONTHLY_BUDGET) * 100

  if (totalCostUSD > MONTHLY_BUDGET * 0.8) {
    recommendations.push({
      priority: 'high',
      message: `You're at ${pct.toFixed(1)}% of your $${MONTHLY_BUDGET} budget. Monitor closely.`,
      savings: `$${(MONTHLY_BUDGET - totalCostUSD).toFixed(2)} remaining`,
    })
  } else if (totalCostUSD > MONTHLY_BUDGET * 0.5) {
    recommendations.push({
      priority: 'medium',
      message: 'Spending is moderate. Keep monitoring usage.',
      savings: `$${(MONTHLY_BUDGET - totalCostUSD).toFixed(2)} remaining`,
    })
  } else {
    recommendations.push({
      priority: 'low',
      message: `You're on track. Current spend: $${totalCostUSD.toFixed(2)}`,
      savings: `$${(MONTHLY_BUDGET - totalCostUSD).toFixed(2)} remaining this month`,
    })
  }

  res.status(200).json({
    dataSource,
    period: FALLBACK_DATA.period,
    models: scaledModels,
    summary: {
      totalCostUSD: parseFloat(totalCostUSD.toFixed(2)),
      totalRequests,
      totalTokensUsed,
      avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCostUSD / totalRequests).toFixed(3)) : 0,
      monthlyBudget: MONTHLY_BUDGET,
      remainingBudget: parseFloat((MONTHLY_BUDGET - totalCostUSD).toFixed(2)),
      percentUsed: parseFloat(pct.toFixed(1)),
      // Include raw OpenRouter data if available
      openRouterRaw: creditData
        ? {
            totalCredits: creditData.total_credits,
            totalUsage: creditData.total_usage,
            limitRemaining: creditData.limit_remaining,
          }
        : null,
    },
    recommendations,
  })
}
