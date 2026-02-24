import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not configured' })
    }

    // Fetch real usage data from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mission-center.local',
        'X-Title': 'Mission Center',
      },
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch OpenRouter data' })
    }

    const data = await response.json()
    const usage = data.data || {}

    // Parse usage by model
    const modelCosts: Record<string, any> = {}
    const usageByModel = usage.usage || []

    usageByModel.forEach((item: any) => {
      const modelName = item.model || 'unknown'
      if (!modelCosts[modelName]) {
        modelCosts[modelName] = {
          name: modelName,
          provider: 'openrouter',
          tokensUsed: 0,
          costUSD: 0,
          requests: 0,
          totalCost: 0,
        }
      }
      modelCosts[modelName].costUSD += item.cost || 0
      modelCosts[modelName].requests += 1
    })

    const models = Object.values(modelCosts).map((m: any) => ({
      name: m.name,
      provider: m.provider,
      tokensUsed: m.tokensUsed,
      costUSD: parseFloat(m.costUSD.toFixed(2)),
      requests: m.requests,
      avgCostPerRequest: m.requests > 0 ? parseFloat((m.costUSD / m.requests).toFixed(2)) : 0,
    }))

    const totalCostUSD = parseFloat(
      models.reduce((sum, m) => sum + m.costUSD, 0).toFixed(2)
    )

    const totalRequests = models.reduce((sum, m) => sum + m.requests, 0)
    const monthlyBudget = 100

    // Generate recommendations
    const recommendations = []
    
    if (totalCostUSD > monthlyBudget * 0.8) {
      recommendations.push({
        priority: 'high',
        message: `You're at ${((totalCostUSD / monthlyBudget) * 100).toFixed(1)}% of your $${monthlyBudget} budget. Consider reducing API usage.`,
        savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining`,
      })
    }

    if (totalCostUSD > monthlyBudget * 0.5) {
      recommendations.push({
        priority: 'medium',
        message: 'Monitor usage closely to stay within budget',
        savings: `Budget allows $${(monthlyBudget - totalCostUSD).toFixed(2)} more`,
      })
    }

    if (models.length > 0 && totalCostUSD < monthlyBudget * 0.5) {
      recommendations.push({
        priority: 'low',
        message: `You're on track. Current spend: $${totalCostUSD.toFixed(2)}`,
        savings: `$${(monthlyBudget - totalCostUSD).toFixed(2)} remaining this month`,
      })
    }

    res.status(200).json({
      period: {
        start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
      },
      models,
      summary: {
        totalCostUSD,
        totalRequests,
        totalTokensUsed: 0,
        avgCostPerRequest: totalRequests > 0 ? parseFloat((totalCostUSD / totalRequests).toFixed(2)) : 0,
        monthlyBudget,
        remainingBudget: parseFloat((monthlyBudget - totalCostUSD).toFixed(2)),
        percentUsed: parseFloat(((totalCostUSD / monthlyBudget) * 100).toFixed(1)),
      },
      recommendations,
    })
  } catch (error) {
    console.error('Usage API error:', error)
    res.status(500).json({ error: 'Failed to fetch usage data' })
  }
}
