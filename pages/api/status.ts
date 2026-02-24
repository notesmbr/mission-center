import type { NextApiRequest, NextApiResponse } from 'next'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface OpenClawSession {
  key: string
  kind: string
  age: string
  model: string
  tokens: string
  flags: string
}

const parseOpenClawSessions = (output: string): OpenClawSession[] => {
  const lines = output.split('\n').filter((line) => line.trim())
  const sessions: OpenClawSession[] = []

  // Skip header lines
  lines.forEach((line, index) => {
    if (index < 3) return // Skip first 3 lines (title, store, count)

    // Parse session line
    const parts = line.split(/\s+/)
    if (parts.length < 5) return

    sessions.push({
      key: parts[1],
      kind: parts[0],
      age: parts[2],
      model: parts[3],
      tokens: parts[4],
      flags: parts.slice(5).join(' '),
    })
  })

  return sessions
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get real session data from OpenClaw
    let sessions: OpenClawSession[] = []
    let opencrawStatus = 'active'
    let uptime = 'unknown'

    try {
      const { stdout } = await execAsync('openclaw sessions list', {
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
      })

      sessions = parseOpenClawSessions(stdout)
      opencrawStatus = sessions.length > 0 ? 'active' : 'idle'
    } catch (error) {
      console.error('Failed to fetch OpenClaw sessions:', error)
      // Fall back to demo data if OpenClaw is not accessible
    }

    // If we have real sessions, build real agent list
    const agentMap = new Map<string, any>()

    if (sessions.length > 0) {
      sessions.forEach((session) => {
        const agentKey = session.key.split(':')[1] || 'unknown'

        if (!agentMap.has(agentKey)) {
          agentMap.set(agentKey, {
            id: agentKey,
            name: agentKey === 'main' ? 'Main Session' : `Agent: ${agentKey}`,
            model: session.model,
            status: 'active',
            tasksCompleted: 0,
            sessionsCount: 0,
            lastActive: session.age,
          })
        }

        const agent = agentMap.get(agentKey)
        agent.tasksCompleted += 1
        agent.sessionsCount += 1
        if (session.age < agent.lastActive) {
          agent.lastActive = session.age
        }
      })
    } else {
      // Demo data if no sessions
      agentMap.set('main', {
        id: 'main',
        name: 'Main Session',
        model: 'openrouter/anthropic/claude-haiku-4-5',
        status: 'active',
        tasksCompleted: 12,
        sessionsCount: 1,
        lastActive: 'now',
      })
    }

    const agents = Array.from(agentMap.values()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model,
      status: agent.status,
      tasksCompleted: agent.tasksCompleted,
    }))

    res.status(200).json({
      openclaw: {
        status: opencrawStatus,
        uptime: uptime,
        lastHeartbeat: new Date().toISOString(),
        totalSessions: sessions.length,
      },
      agents,
    })
  } catch (error) {
    console.error('Status API error:', error)

    // Fallback to demo data on error
    res.status(200).json({
      openclaw: {
        status: 'unknown',
        uptime: 'unknown',
        lastHeartbeat: new Date().toISOString(),
        totalSessions: 0,
      },
      agents: [
        {
          id: 'main',
          name: 'Main Session',
          model: 'openrouter/anthropic/claude-haiku-4-5',
          status: 'unknown',
          tasksCompleted: 0,
        },
      ],
    })
  }
}
