import type { NextApiRequest, NextApiResponse } from 'next'

type ModelsListResponse =
  | {
      dataSource: 'openclaw_models_list'
      available: true
      models: any[]
      count: number
      lastUpdated: string
    }
  | {
      dataSource: 'openclaw_models_list'
      available: false
      reason: string
      lastUpdated: string
    }

export default async function handler(req: NextApiRequest, res: NextApiResponse<ModelsListResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const { runOpenClawCommand } = await import('../_lib/openclaw')

    const out: string = await runOpenClawCommand(['models', 'list', '--json'], 8000)

    const data = JSON.parse(out)

    return res.status(200).json({
      dataSource: 'openclaw_models_list',
      available: true,
      models: data?.models || [],
      count: data?.count || (data?.models?.length ?? 0),
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'openclaw_models_list',
      available: false,
      reason: `Failed to run openclaw models list --json: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
