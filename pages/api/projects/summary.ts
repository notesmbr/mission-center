import type { NextApiRequest, NextApiResponse } from 'next'

import type { ProjectSummary } from '../../../lib/projects'

type ProjectsSummaryResponse =
  | {
      dataSource: 'clawdbot_projects_summary'
      available: true
      projects: ProjectSummary[]
      lastUpdated: string
    }
  | {
      dataSource: 'clawdbot_projects_summary'
      available: false
      reason: string
      lastUpdated: string
    }

export default async function handler(req: NextApiRequest, res: NextApiResponse<ProjectsSummaryResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      dataSource: 'clawdbot_projects_summary',
      available: false,
      reason: `Method ${req.method} not allowed`,
      lastUpdated: new Date().toISOString(),
    })
  }

  try {
    const { getSwarmHostAvailability, readActiveTasks, readClawdbotConfig, sanitizeTasks } = await import('../../../lib/swarm')
    const { getProjectSummaries } = await import('../../../lib/projects')

    const availability = getSwarmHostAvailability()
    if (!availability.available) {
      return res.status(200).json({
        dataSource: 'clawdbot_projects_summary',
        available: false,
        reason: availability.reason,
        lastUpdated: new Date().toISOString(),
      })
    }

    const { tasks: rawTasks } = readActiveTasks()
    const { projects } = readClawdbotConfig()

    const tasks = sanitizeTasks(rawTasks || [])
    const summaries = getProjectSummaries({ projects, tasks })

    return res.status(200).json({
      dataSource: 'clawdbot_projects_summary',
      available: true,
      projects: summaries,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'clawdbot_projects_summary',
      available: false,
      reason: `Failed to load projects summary: ${err?.message || String(err)}`,
      lastUpdated: new Date().toISOString(),
    })
  }
}
