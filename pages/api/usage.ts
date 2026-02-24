import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const dataFile = path.join(process.cwd(), '.data', 'usage.json')

const readUsageData = () => {
  try {
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Error reading usage data:', e)
  }
  
  // Default demo data
  return {
    totalCost: 15.20,
    lastUpdate: new Date().toISOString(),
    models: {
      'claude-haiku-4-5': { name: 'claude-haiku-4-5', costUSD: 8.50, requests: 45, tokensUsed: 0 },
      'claude-sonnet-4.6': { name: 'claude-sonnet-4.6', costUSD: 4.20, requests: 3, tokensUsed: 0 },
      'gemini-2.0-flash': { name: 'gemini-2.0-flash', costUSD: 2.50, requests: 12, tokensUsed: 0 },
    },
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const usageData = readUsageData()
  const models = Object.values(usageData.models || {}).map((m: any) => ({
    name: m.name,
    provider: 'openrouter',
    tokensUsed: m.tokensUsed || 0,
    costUSD: parseFloat(m.costUSD.toFixed(2)),
    requests: m.requests || 0,
    avgCostPerRequest: m.requests > 0 ? parseFloat((m.costUSD / m.requests).toFixed(2)) : 0,
  }))

  const totalCostUSD = parseFloat(usageData.totalCost?.toFixed(2) || '0')
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
}
