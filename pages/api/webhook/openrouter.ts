import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const dataFile = path.join(process.cwd(), '.data', 'usage.json')

// Ensure data directory exists
const ensureDataDir = () => {
  const dir = path.dirname(dataFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const readUsageData = () => {
  ensureDataDir()
  if (!fs.existsSync(dataFile)) {
    return { lastUpdate: null, totalCost: 0, models: {} }
  }
  try {
    const data = fs.readFileSync(dataFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { lastUpdate: null, totalCost: 0, models: {} }
  }
}

const writeUsageData = (data: any) => {
  ensureDataDir()
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
}

// OpenRouter pricing per 1M tokens (input/output)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-4.5': { input: 0.8, output: 4.0 },
  'anthropic/claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'anthropic/claude-sonnet-4.6': { input: 3.0, output: 15.0 },
  'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'anthropic/claude-opus-4-6': { input: 15.0, output: 75.0 },
  'anthropic/claude-opus-4.6': { input: 15.0, output: 75.0 },
  'openai/gpt-4-turbo': { input: 10.0, output: 30.0 },
  'openai/gpt-4': { input: 30.0, output: 60.0 },
  'google/gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'google/gemini-2.0-flash-lite': { input: 0.0375, output: 0.15 },
}

const calculateCost = (model: string, promptTokens: number, completionTokens: number): number => {
  const pricing = MODEL_PRICING[model] || { input: 0, output: 0 }
  const inputCost = (promptTokens / 1000000) * pricing.input
  const outputCost = (completionTokens / 1000000) * pricing.output
  return inputCost + outputCost
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = req.body

    // Handle OpenTelemetry format (OTEL traces from OpenRouter)
    if (payload.resourceSpans) {
      const usageData = readUsageData()
      const now = new Date().toISOString()
      let processed = 0

      // Extract spans from OTEL format
      payload.resourceSpans.forEach((resourceSpan: any) => {
        resourceSpan.scopeSpans?.forEach((scopeSpan: any) => {
          scopeSpan.spans?.forEach((span: any) => {
            // Extract attributes from the span
            const attrs: Record<string, any> = {}
            span.attributes?.forEach((attr: any) => {
              const key = attr.key
              const value =
                attr.value.stringValue ||
                attr.value.intValue ||
                attr.value.doubleValue ||
                attr.value.boolValue
              attrs[key] = value
            })

            // Extract model and token usage
            const model = attrs['gen_ai.request.model'] || 'unknown'
            const promptTokens = parseInt(attrs['gen_ai.usage.prompt_tokens'] || '0')
            const completionTokens = parseInt(attrs['gen_ai.usage.completion_tokens'] || '0')
            const totalTokens = promptTokens + completionTokens
            const cost = calculateCost(model, promptTokens, completionTokens)

            if (!usageData.models[model]) {
              usageData.models[model] = {
                name: model,
                costUSD: 0,
                requests: 0,
                tokensUsed: 0,
              }
            }

            usageData.models[model].requests += 1
            usageData.models[model].tokensUsed += totalTokens
            usageData.models[model].costUSD += cost
            usageData.totalCost = (usageData.totalCost || 0) + cost
            usageData.lastUpdate = now
            processed++
          })
        })
      })

      writeUsageData(usageData)

      return res.status(200).json({
        status: 'recorded',
        spansProcessed: processed,
        totalCost: usageData.totalCost,
      })
    }

    // Handle simple JSON format (fallback)
    if (req.body.type && req.body.data) {
      const webhook = req.body
      const usageData = readUsageData()
      const now = new Date().toISOString()

      switch (webhook.type) {
        case 'usage':
        case 'inference_request':
          const model = webhook.data.model || 'unknown'
          const cost = webhook.data.cost || webhook.data.total_cost || 0

          if (!usageData.models[model]) {
            usageData.models[model] = {
              name: model,
              costUSD: 0,
              requests: 0,
              tokensUsed: 0,
            }
          }

          usageData.models[model].costUSD += cost
          usageData.models[model].requests += 1
          usageData.models[model].tokensUsed += webhook.data.tokens_used || 0
          usageData.totalCost += cost
          usageData.lastUpdate = now

          writeUsageData(usageData)

          return res.status(200).json({
            status: 'recorded',
            model,
            cost,
            totalCost: usageData.totalCost,
          })

        case 'billing_summary':
          usageData.totalCost = webhook.data.total_cost || 0
          usageData.period = webhook.data.period
          usageData.lastUpdate = now

          if (webhook.data.models) {
            usageData.models = webhook.data.models
          }

          writeUsageData(usageData)

          return res.status(200).json({
            status: 'updated',
            totalCost: usageData.totalCost,
          })

        default:
          return res.status(200).json({ status: 'ignored', type: webhook.type })
      }
    }

    return res.status(400).json({ error: 'Unknown webhook format' })
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: 'Failed to process webhook', details: String(error) })
  }
}
