import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

import { WORKSPACE_ROOT } from './paths'
const CLAWDBOT_DIR = path.join(WORKSPACE_ROOT, '.clawdbot')
const ACTIVE_TASKS_PATH = path.join(CLAWDBOT_DIR, 'active-tasks.json')
const CONFIG_PATH = path.join(CLAWDBOT_DIR, 'config.json')

export type ClawdbotTask = {
  id: string
  projectId?: string
  repo?: string
  agent?: string
  description?: string
  prompt?: string
  branch?: string
  tmuxSession?: string
  status?: string
  createdAt?: number
  updatedAt?: number
  attempts?: number
  maxAttempts?: number
  baseBranch?: string
  notifyOnComplete?: boolean
  worktree?: string
  startedAt?: number
  note?: string
}

export type ClawdbotConfigProject = {
  id: string
  name?: string
  repo?: string
  enabled?: boolean
}

export function readActiveTasks(): { tasks: ClawdbotTask[] } {
  if (!fs.existsSync(ACTIVE_TASKS_PATH)) return { tasks: [] }
  const raw = fs.readFileSync(ACTIVE_TASKS_PATH, 'utf-8')
  const data = JSON.parse(raw)
  return { tasks: Array.isArray(data?.tasks) ? data.tasks : [] }
}

export function readClawdbotConfig(): { projects: ClawdbotConfigProject[] } {
  if (!fs.existsSync(CONFIG_PATH)) return { projects: [] }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
  const data = JSON.parse(raw)
  return { projects: Array.isArray(data?.projects) ? data.projects : [] }
}

export function runOrchestratorCommand(args: string[], timeoutMs = 20000): Promise<string> {
  // example: ['status'] or ['check']
  const script = path.join(CLAWDBOT_DIR, 'orchestrator.py')
  return new Promise((resolve, reject) => {
    execFile('python3', [script, ...args], { timeout: timeoutMs, cwd: WORKSPACE_ROOT }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout)
    })
  })
}
