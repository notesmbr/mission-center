import os from 'os'
import path from 'path'

const HOME = process.env.HOME || os.homedir()

export const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(HOME, '.openclaw')
export const WORKSPACE_ROOT =
  process.env.OPENCLAW_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || path.join(OPENCLAW_DIR, 'workspace')

export const OPENCLAW_CONFIG_PATH =
  process.env.OPENCLAW_CONFIG_PATH || path.join(OPENCLAW_DIR, 'openclaw.json')

export const OPENCLAW_LOG_DIR = process.env.OPENCLAW_LOG_DIR || path.join(OPENCLAW_DIR, 'logs')
export const GATEWAY_LOG_PATH = path.join(OPENCLAW_LOG_DIR, 'gateway.log')
export const GATEWAY_ERR_LOG_PATH = path.join(OPENCLAW_LOG_DIR, 'gateway.err.log')
