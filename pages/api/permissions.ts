import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    authorizations: {
      github: {
        status: 'authorized',
        permissions: [
          'Create repositories programmatically',
          'Push code to repositories',
          'Manage GitHub workflows',
        ],
        username: 'notesmbr',
        details: 'Full token access for repo automation',
      },
      cryptoTrading: {
        status: 'authorized',
        permissions: [
          'Change trading coins from Coinbase',
          'Adjust entry/exit rules (RSI thresholds, profit targets, stops)',
          'Modify risk parameters (position sizing, capital allocation)',
          'Test new technical indicators (ATR, MACD, Bollinger Bands)',
          'Optimize strategy based on live performance',
          'Rotate coins based on volume and performance',
          'Deploy strategy changes without approval',
        ],
        currentSetup: {
          capital: '$100 (virtual)',
          mode: 'Day trading',
          frequency: 'Every 15 minutes',
          strategy: 'Self-evolving momentum',
          status: 'Active',
        },
        logLocation: '/Users/notesmbr/.openclaw/workspace/trader.log',
        configLocation: '/Users/notesmbr/.openclaw/workspace/strategy_config.json',
      },
      openRouter: {
        status: 'active',
        permissions: ['Query billing/usage data', 'Run inference requests', 'Use multiple models'],
        monthlyBudget: '$100',
        currentSpend: 'Dynamic (from /api/usage)',
      },
    },
    activeProjects: [
      {
        name: 'Mission Center',
        status: 'active',
        url: 'https://mission-center-production.up.railway.app',
        repo: 'https://github.com/notesmbr/mission-center',
        description: 'Command & control dashboard for OpenClaw',
        features: ['Agent monitoring', 'API cost tracking', 'Budget analysis', 'Real-time webhooks'],
      },
      {
        name: 'Crypto Trading Bot',
        status: 'active',
        repo: '/Users/notesmbr/.openclaw/workspace',
        description: 'Self-evolving momentum trading strategy',
        features: ['Live trading', 'Auto-optimization', 'Performance tracking', 'Risk management'],
      },
    ],
    agents: [
      {
        name: 'Main Session',
        model: 'Claude Haiku 4.5',
        role: 'Primary command agent',
      },
      {
        name: 'Research Agent',
        model: 'Claude Sonnet 4.6',
        role: 'Analysis and research',
      },
      {
        name: 'Code Agent',
        model: 'Claude Opus 4.6',
        role: 'Development and implementation',
      },
    ],
    lastUpdated: new Date().toISOString(),
  })
}
