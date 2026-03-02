import fs from 'fs'
import path from 'path'

import { GATEWAY_ERR_LOG_PATH, GATEWAY_LOG_PATH } from './paths'

export const OPENCLAW_ACTIVITY_LOGS = {
  gateway: GATEWAY_LOG_PATH,
  gatewayErr: GATEWAY_ERR_LOG_PATH,
} as const

export type ActivityLogId = keyof typeof OPENCLAW_ACTIVITY_LOGS

const ALLOWED_LOG_PATHS = new Set(Object.values(OPENCLAW_ACTIVITY_LOGS).map((p) => path.resolve(p)))

export function isAllowedActivityLogPath(filePath: string): boolean {
  return ALLOWED_LOG_PATHS.has(path.resolve(filePath))
}

export function resolveActivityLogIds(input: unknown): ActivityLogId[] {
  const selected = String(input || 'both').toLowerCase()
  if (selected === 'gateway') return ['gateway']
  if (selected === 'gateway_err' || selected === 'gatewayerr' || selected === 'stderr') return ['gatewayErr']
  return ['gateway', 'gatewayErr']
}

export function tailLines(text: string, maxLines: number): { tail: string; lineCount: number } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  return {
    tail: lines.slice(-maxLines).join('\n'),
    lineCount: lines.length,
  }
}

export function tailFileLines(
  filePath: string,
  maxLines: number,
  maxBytes = 200_000
): { tail: string; lineCountEstimate: number } {
  // Efficient tail: read only the end of the file.
  const stat = fs.statSync(filePath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const length = size - start

  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(length)
    fs.readSync(fd, buf, 0, length, start)
    const text = buf.toString('utf-8')
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
    return {
      tail: lines.slice(-maxLines).join('\n'),
      lineCountEstimate: lines.length,
    }
  } finally {
    fs.closeSync(fd)
  }
}

export function redactTokenLikeStrings(text: string): string {
  if (!text) return text

  let redacted = text

  redacted = redacted.replace(/\b(Bearer\s+)[A-Za-z0-9._-]{12,}\b/gi, '$1[REDACTED]')

  redacted = redacted.replace(
    /\b(token|api[_-]?key|authorization|auth)\b\s*([:=])\s*(["']?)[^\s"',;]+(["']?)/gi,
    (_match, key: string, delimiter: string) => `${key}${delimiter}[REDACTED]`
  )

  redacted = redacted.replace(/\b[A-Za-z0-9._-]{24,}\b/g, (candidate) => {
    const hasLetter = /[A-Za-z]/.test(candidate)
    const hasDigit = /\d/.test(candidate)
    return hasLetter && hasDigit ? '[REDACTED_TOKEN]' : candidate
  })

  return redacted
}

export function combineLogTails(chunks: Array<{ id: ActivityLogId; tail: string }>): string {
  const formatted = chunks
    .filter((chunk) => chunk.tail.trim().length > 0)
    .map((chunk) => `[${chunk.id}]\n${chunk.tail}`)

  return formatted.join('\n\n').trim()
}
