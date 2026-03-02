import { execFile } from 'child_process'
import fs from 'fs'

import { OPENCLAW_CONFIG_PATH } from './paths'

function readGatewayConfig() {
  const out: { token?: string; url?: string } = {}
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return out
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')
    const cfg = JSON.parse(raw)
    const token = cfg?.gateway?.auth?.token || cfg?.gateway?.remote?.token
    if (token) out.token = token

    if (cfg?.gateway?.remote?.url) {
      out.url = cfg.gateway.remote.url
    } else if (cfg?.gateway?.port) {
      out.url = `ws://127.0.0.1:${cfg.gateway.port}`
    }
  } catch (_err) {
    // non-fatal: fallback to default CLI behavior
  }

  return out
}

export function runOpenClawCommand(args: string[], timeoutMs = 8000): Promise<string> {
  const { token, url } = readGatewayConfig()
  const cmd = ['openclaw', ...args]

  if (token) cmd.push('--token', token)
  if (url) cmd.push('--url', url)

  return new Promise((resolve, reject) => {
    execFile(cmd[0], cmd.slice(1), { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout)
    })
  })
}
