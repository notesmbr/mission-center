import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.OPENROUTER_API_KEY

  res.status(200).json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyStart: key ? key.substring(0, 20) : null,
    keyEnd: key ? key.substring(key.length - 5) : null,
    allEnvKeys: Object.keys(process.env)
      .filter((k) => k.includes('ROUTER') || k.includes('API') || k.includes('KEY'))
      .map((k) => `${k}=${process.env[k]?.substring(0, 10)}...`),
  })
}
