import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    openclaw: {
      status: 'active',
      uptime: 'continuous',
      lastHeartbeat: new Date().toISOString(),
    },
    agents: [
      {
        id: 'main',
        name: 'Main Session',
        model: 'openrouter/anthropic/claude-haiku-4-5',
        status: 'active',
        tasksCompleted: 0,
      },
      {
        id: 'isolated-research',
        name: 'Research Agent',
        model: 'openrouter/anthropic/claude-sonnet-4.6',
        status: 'active',
        tasksCompleted: 0,
      },
      {
        id: 'isolated-code',
        name: 'Code Agent',
        model: 'openrouter/anthropic/claude-opus-4-6',
        status: 'active',
        tasksCompleted: 0,
      },
    ],
  })
}
