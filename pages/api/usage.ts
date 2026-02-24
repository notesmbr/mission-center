import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    period: {
      start: '2026-02-23',
      end: new Date().toISOString().split('T')[0],
    },
    models: [
      {
        name: 'claude-haiku-4-5',
        provider: 'openrouter',
        tokensUsed: 125430,
        tokensLimit: 1000000,
        costUSD: 18.50,
        requests: 87,
        avgCostPerRequest: 0.21,
      },
      {
        name: 'claude-sonnet-4.6',
        provider: 'openrouter',
        tokensUsed: 45670,
        tokensLimit: 1000000,
        costUSD: 45.67,
        requests: 12,
        avgCostPerRequest: 3.81,
      },
      {
        name: 'claude-opus-4-6',
        provider: 'openrouter',
        tokensUsed: 23450,
        tokensLimit: 1000000,
        costUSD: 58.63,
        requests: 5,
        avgCostPerRequest: 11.73,
      },
      {
        name: 'gemini-2.0-flash',
        provider: 'openrouter',
        tokensUsed: 89230,
        tokensLimit: 1000000,
        costUSD: 5.35,
        requests: 34,
        avgCostPerRequest: 0.16,
      },
    ],
    summary: {
      totalCostUSD: 128.15,
      totalRequests: 138,
      totalTokensUsed: 283780,
      avgCostPerRequest: 0.93,
    },
    recommendations: [
      {
        priority: 'high',
        message: 'Consider routing more heavy tasks to Haiku/Flash to reduce costs',
        savings: '$25-40/month',
      },
      {
        priority: 'medium',
        message: 'Opus usage is trending up. Set token limits to prevent runaway costs.',
        savings: '$15-20/month',
      },
    ],
  })
}
