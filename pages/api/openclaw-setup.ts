import type { NextApiRequest, NextApiResponse } from 'next'

// Read-only endpoint: reports local OpenClaw setup as observed from openclaw.json.
// NOTE: On Railway this file won't exist; we return a clear "unavailable" response.

const OPENCLAW_CONFIG_PATH = '/Users/notesmbr/.openclaw/openclaw.json'

type SetupResponse =
  | {
      dataSource: 'local_file'
      available: true
      configPath: string
      summary: {
        defaultModel: string | null
        thinkingDefault: string | null
        gateway: { mode: string | null; bind: string | null; port: number | null }
        channels: string[]
        pluginsEnabled: string[]
        authProfiles: string[]
        webSearchProvider: string | null
      }
      raw: any
      lastUpdated: string
    }
  | {
      dataSource: 'local_file'
      available: false
      reason: string
      configPath: string
      lastUpdated: string
    }

function redactSecrets(cfg: any) {
  const d = JSON.parse(JSON.stringify(cfg || {}))
  // common secrets
  if (d?.channels?.discord?.token) d.channels.discord.token = 'REDACTED'
  if (d?.tools?.web?.search?.apiKey) d.tools.web.search.apiKey = 'REDACTED'
  if (d?.gateway?.auth?.token) d.gateway.auth.token = 'REDACTED'
  return d
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SetupResponse>) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const fs = await import('fs')
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return res.status(200).json({
        dataSource: 'local_file',
        available: false,
        reason: 'openclaw.json not found on this host (expected when running on Railway).',
        configPath: OPENCLAW_CONFIG_PATH,
        lastUpdated: new Date().toISOString(),
      })
    }

    const rawText = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')
    const cfg = JSON.parse(rawText)
    const redacted = redactSecrets(cfg)

    const defaultModel = cfg?.agents?.defaults?.model?.primary ?? null
    const thinkingDefault = cfg?.agents?.defaults?.thinkingDefault ?? null
    const gateway = {
      mode: cfg?.gateway?.mode ?? null,
      bind: cfg?.gateway?.bind ?? null,
      port: cfg?.gateway?.port ?? null,
    }

    const channels = Object.keys(cfg?.channels || {})
    const pluginsEnabled = Object.entries(cfg?.plugins?.entries || {})
      .filter(([, v]: any) => v?.enabled)
      .map(([k]) => k)

    const authProfiles = Object.keys(cfg?.auth?.profiles || {})
    const webSearchProvider = cfg?.tools?.web?.search?.provider ?? null

    return res.status(200).json({
      dataSource: 'local_file',
      available: true,
      configPath: OPENCLAW_CONFIG_PATH,
      summary: {
        defaultModel,
        thinkingDefault,
        gateway,
        channels,
        pluginsEnabled,
        authProfiles,
        webSearchProvider,
      },
      raw: redacted,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(200).json({
      dataSource: 'local_file',
      available: false,
      reason: `Failed to read/parse openclaw.json: ${err?.message || String(err)}`,
      configPath: OPENCLAW_CONFIG_PATH,
      lastUpdated: new Date().toISOString(),
    })
  }
}
