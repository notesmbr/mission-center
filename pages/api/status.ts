import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    openclaw: {
      status: 'active',
      uptime: '4h 23m',
      lastHeartbeat: new Date().toISOString(),
    },
    agents: [
      {
        id: 'main',
        name: 'Main Session',
        model: 'openrouter/anthropic/claude-haiku-4-5',
        status: 'active',
        tasksCompleted: 12,
      },
      {
        id: 'isolated-1',
        name: 'Research Agent',
        model: 'openrouter/anthropic/claude-sonnet-4.6',
        status: 'idle',
        tasksCompleted: 3,
      },
      {
        id: 'isolated-2',
        name: 'Code Agent',
        model: 'openrouter/anthropic/claude-opus-4-6',
        status: 'active',
        tasksCompleted: 5,
      },
    ],
  })
}
