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
    const { execFile } = await import('child_process')

    const out: string = await new Promise((resolve, reject) => {
      execFile('openclaw', ['models', 'list', '--json'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message))
        resolve(stdout)
      })
    })

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
