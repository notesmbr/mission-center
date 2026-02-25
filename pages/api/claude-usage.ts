import type { NextApiRequest, NextApiResponse } from 'next'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  // Determine key type and mask it
  const keyLast4 = ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.slice(-4) : 'N/A'
  const isOAuth = ANTHROPIC_API_KEY.startsWith('sk-ant-oat')
  const isApiKey = ANTHROPIC_API_KEY.startsWith('sk-ant-api')
  const keyType = isOAuth ? 'OAuth (Max Subscription)' : isApiKey ? 'API Key' : 'Unknown'
  const tier = isOAuth ? 'Max' : 'API Credits'

  // Try to validate the key by making a lightweight request
  let keyStatus = 'unknown'
  if (ANTHROPIC_API_KEY) {
    try {
      const testRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20250918',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: AbortSignal.timeout(5000),
      })

      if (testRes.ok) {
        keyStatus = 'active'
      } else {
        const errBody = await testRes.json().catch(() => ({}))
        if (testRes.status === 401) {
          keyStatus = 'invalid'
        } else if (testRes.status === 429) {
          keyStatus = 'rate_limited (active)'
        } else if (errBody?.error?.type === 'authentication_error') {
          keyStatus = 'auth_error'
        } else {
          // Other errors (like overloaded) still mean key works
          keyStatus = 'active'
        }
      }
    } catch (err) {
      keyStatus = 'active (check failed)'
    }
  } else {
    keyStatus = 'not_configured'
  }

  // Fetch Anthropic model usage from the OpenRouter usage endpoint
  let anthropicModels: any[] = []
  let totalAnthropicCost = 0
  let totalAnthropicTokens = 0
  let totalAnthropicRequests = 0

  try {
    // Internal fetch to our own usage endpoint
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers.host || 'localhost:3000'
    const usageRes = await fetch(`${protocol}://${host}/api/usage`, {
      signal: AbortSignal.timeout(5000),
    })

    if (usageRes.ok) {
      const usageData = await usageRes.json()
      if (usageData.models) {
        anthropicModels = usageData.models
          .filter((m: any) => m.name.includes('anthropic') || m.name.includes('claude'))
          .map((m: any) => ({
            model: m.name,
            cost: m.costUSD,
            tokens: m.tokensUsed,
            requests: m.requests,
          }))

        totalAnthropicCost = anthropicModels.reduce((sum: number, m: any) => sum + m.cost, 0)
        totalAnthropicTokens = anthropicModels.reduce((sum: number, m: any) => sum + m.tokens, 0)
        totalAnthropicRequests = anthropicModels.reduce((sum: number, m: any) => sum + m.requests, 0)
      }
    }
  } catch (err) {
    console.error('[claude-usage] Failed to fetch internal usage data:', err)
  }

  res.status(200).json({
    subscription: {
      tier,
      status: keyStatus === 'active' || keyStatus === 'rate_limited (active)' || keyStatus === 'active (check failed)' ? 'active' : keyStatus,
    },
    key: {
      type: keyType,
      last4: keyLast4,
      status: keyStatus,
      configured: !!ANTHROPIC_API_KEY,
    },
    limits: {
      dailyTokens: isOAuth ? 'Unlimited (Max tier)' : 'Credit-based',
      monthlyTokens: isOAuth ? 'Unlimited (Max tier)' : 'Credit-based',
      note: isOAuth
        ? 'Max subscription includes generous usage limits. Rate limits apply per-minute.'
        : 'Usage deducted from prepaid credits.',
    },
    usage: {
      totalCost: parseFloat(totalAnthropicCost.toFixed(2)),
      totalTokens: totalAnthropicTokens,
      totalRequests: totalAnthropicRequests,
      models: anthropicModels,
      source: 'openrouter',
    },
  })
}
