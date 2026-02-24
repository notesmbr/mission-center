import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    env_keys: Object.keys(process.env).filter(k => k.includes('NEXT') || k.includes('OPENROUTER')),
    has_api_key: !!process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
    key_first_10: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY?.substring(0, 10) || 'NOT_SET',
  })
}
