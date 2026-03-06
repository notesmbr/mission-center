import type { NextApiRequest, NextApiResponse } from 'next'

// Alias for /api/trader/status with identical payload.
// Preferred endpoint per docs: /api/trader/state.

import handler from './status'

export default async function stateHandler(req: NextApiRequest, res: NextApiResponse) {
  return handler(req, res)
}
