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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const webhook = req.body

    // Validate webhook has required fields
    if (!webhook.type || !webhook.data) {
      return res.status(400).json({ error: 'Invalid webhook format' })
    }

    const usageData = readUsageData()
    const now = new Date().toISOString()

    // Handle different webhook types
    switch (webhook.type) {
      case 'usage':
      case 'inference_request':
        // Update model usage
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
          totalCost: usageData.totalCost 
        })

      case 'billing_summary':
        // Update monthly billing
        usageData.totalCost = webhook.data.total_cost || 0
        usageData.period = webhook.data.period
        usageData.lastUpdate = now

        if (webhook.data.models) {
          usageData.models = webhook.data.models
        }

        writeUsageData(usageData)

        return res.status(200).json({ 
          status: 'updated',
          totalCost: usageData.totalCost 
        })

      default:
        return res.status(200).json({ status: 'ignored', type: webhook.type })
    }
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: 'Failed to process webhook' })
  }
}
