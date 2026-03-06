import fs from 'fs'
import path from 'path'

import { WORKSPACE_ROOT, redactSensitiveText } from './tasks'

export const TRADER_HOST_ONLY_REASON = 'Trader view is only available on the OpenClaw host.'
export const TRADER_PROJECT_RELATIVE_PATH = 'autonomous-crypto-trader'
export const TRADER_PROJECT_DIR = path.join(WORKSPACE_ROOT, TRADER_PROJECT_RELATIVE_PATH)

export const TRADER_ALLOWED_FILES = {
  state: 'state.json',
  trades: 'trades.jsonl',
  log: 'trader.log',
  killSwitch: 'KILL_SWITCH',
  db: path.join('data', 'trader.db'),
} as const

export type TraderFileKey = keyof typeof TRADER_ALLOWED_FILES
export type TraderMode = 'paper' | 'live' | 'unknown'

export type TraderOpenPosition = {
  product: string
  qty: number
  entryPrice?: number
  markPrice?: number
  unrealizedPnlUsd?: number
}

export type TraderRiskSnapshot = {
  drawdownHalt?: boolean
  cooldownActive?: boolean
  drawdownPct?: number
  maxDrawdownSeenPct?: number
  lossStreak?: number
  dayId?: string
  dayRealizedPnlUsd?: number
  dayStartEquityUsd?: number
  updatedTs?: string | null
}

export type TraderStrategyParamsSnapshot = {
  [key: string]: string | number | boolean | null
}

export type TraderAiStrategistSnapshot = {
  enabled: boolean
  provider: string | null
  model: string | null
  state: {
    lastRunTs: string | null
    lastChange: string | null
  }
}

export type TraderTradeRow = {
  id: string | null
  type: 'closed_trade'
  product: string
  side: string | null
  qtyBase: number | null
  entryPrice: number | null
  exitPrice: number | null
  pnlUsd: number | null
  pnlPct: number | null
  openTs: string | null
  closeTs: string | null
  reason: string | null
}

export type TraderStatusSnapshot = {
  mode: TraderMode
  equityUsd: number | null
  cashUsd: number | null
  openPositions: TraderOpenPosition[]
  openOrdersCount: number
  openOrders: Array<{ id: string | null; product: string | null; side: string | null; qtyBase: number | null; status: string | null }>
  risk: TraderRiskSnapshot
  strategyParams: TraderStrategyParamsSnapshot
  aiStrategist: TraderAiStrategistSnapshot
  products: string[]
  lastRunTs: string | null
  lastError: string | null
  killSwitchEnabled: boolean
}

type AvailabilityResult = { available: true } | { available: false; reason: string }

type JsonlTailOptions = {
  initialBytes?: number
  maxBytes?: number
  maxPasses?: number
}

const ALLOWED_ABS_PATHS = Object.freeze(
  Object.fromEntries(
    (Object.keys(TRADER_ALLOWED_FILES) as TraderFileKey[]).map((key) => [key, path.resolve(TRADER_PROJECT_DIR, TRADER_ALLOWED_FILES[key])]),
  ) as Record<TraderFileKey, string>,
)

const ALLOWED_ABS_PATH_SET = new Set<string>(Object.values(ALLOWED_ABS_PATHS))

function isPathInsideOrEqual(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toIsoTimestamp(value: unknown): string | null {
  if (value == null) return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Interpret typical unix-seconds values first.
    const ms = value > 1e12 ? value : value > 1e10 ? value : value * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const text = asTrimmedString(value)
  if (!text) return null

  const parsedNumber = Number(text)
  if (Number.isFinite(parsedNumber)) {
    return toIsoTimestamp(parsedNumber)
  }

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toSafeMode(value: unknown): TraderMode {
  const text = String(value || '')
    .trim()
    .toLowerCase()
  if (text === 'paper') return 'paper'
  if (text === 'live') return 'live'
  return 'unknown'
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asFiniteNumber(value)
    if (n !== null) return n
  }
  return null
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const s = asTrimmedString(value)
    if (s) return s
  }
  return null
}

function sanitizeProduct(value: unknown): string | null {
  const text = asTrimmedString(value)
  if (!text) return null
  if (/[^A-Za-z0-9._:-]/.test(text)) return null
  return text
}

function resolveSafeAllowlistedPath(fileKey: TraderFileKey, options?: { mustExist?: boolean }): string {
  const expectedPath = resolveTraderPath(fileKey)
  if (!isAllowedTraderPath(expectedPath)) {
    throw new Error('Path is not allowlisted')
  }

  const mustExist = options?.mustExist !== false
  if (!fs.existsSync(expectedPath)) {
    if (mustExist) throw new Error(`Missing file: ${TRADER_ALLOWED_FILES[fileKey]}`)
    return expectedPath
  }

  const stat = fs.lstatSync(expectedPath)
  if (stat.isSymbolicLink()) {
    throw new Error('Symlinked files are not allowed')
  }

  const realPath = fs.realpathSync(expectedPath)
  if (realPath !== expectedPath) {
    throw new Error('Unexpected real path')
  }

  const projectRealPath = fs.realpathSync(TRADER_PROJECT_DIR)
  if (!isPathInsideOrEqual(projectRealPath, realPath)) {
    throw new Error('Path escapes trader project directory')
  }

  return expectedPath
}

function readJsonFile(allowedKey: 'state'): any {
  const safePath = resolveSafeAllowlistedPath(allowedKey)
  const content = fs.readFileSync(safePath, 'utf-8')
  return JSON.parse(content)
}

function readUtf8Tail(safePath: string, maxBytes = 200_000): string {
  const stat = fs.statSync(safePath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const length = size - start
  const fd = fs.openSync(safePath, 'r')
  try {
    const buf = Buffer.alloc(length)
    fs.readSync(fd, buf, 0, length, start)
    return buf.toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

function parseOpenPositions(state: any): TraderOpenPosition[] {
  const prices = state?.prices && typeof state.prices === 'object' ? state.prices : {}
  const openMeta = state?.portfolio?.open_meta && typeof state.portfolio.open_meta === 'object' ? state.portfolio.open_meta : {}
  const fromState = Array.isArray(state?.openPositions)
    ? state.openPositions
    : Array.isArray(state?.open_positions)
      ? state.open_positions
      : null

  const positions: TraderOpenPosition[] = []

  if (fromState) {
    for (const item of fromState) {
      const product = sanitizeProduct(item?.product ?? item?.symbol)
      const qty = asFiniteNumber(item?.qty ?? item?.size ?? item?.amount)
      if (!product || qty === null || qty === 0) continue
      const entryPrice = pickFirstNumber(item?.entryPrice, item?.entry_price, item?.avgEntryPrice, item?.avg_entry_price)
      const markPrice = pickFirstNumber(item?.markPrice, item?.mark_price, prices?.[product], item?.price)
      const unrealizedPnlUsd = pickFirstNumber(item?.unrealizedPnlUsd, item?.unrealized_pnl_usd, item?.unrealizedPnl, item?.pnlUsd)
      positions.push({
        product,
        qty,
        ...(entryPrice === null ? {} : { entryPrice }),
        ...(markPrice === null ? {} : { markPrice }),
        ...(unrealizedPnlUsd === null ? {} : { unrealizedPnlUsd }),
      })
    }
    return positions
  }

  const rawPositions = state?.portfolio?.positions
  if (!rawPositions || typeof rawPositions !== 'object') return positions

  for (const [rawProduct, rawPos] of Object.entries(rawPositions as Record<string, any>)) {
    const product = sanitizeProduct(rawProduct)
    if (!product) continue
    const qty = pickFirstNumber(rawPos?.qty, rawPos?.size, rawPos?.amount, rawPos?.position, rawPos)
    if (qty === null || qty === 0) continue

    const meta = openMeta?.[product]
    const entryPrice = pickFirstNumber(rawPos?.entry_price, rawPos?.entryPrice, rawPos?.avg_entry_price, meta?.entry_price, meta?.entryPrice)
    const markPrice = pickFirstNumber(rawPos?.mark_price, rawPos?.markPrice, prices?.[product])
    const unrealizedPnlUsd = pickFirstNumber(
      rawPos?.unrealized_pnl_usd,
      rawPos?.unrealizedPnlUsd,
      rawPos?.pnl_usd,
      meta?.unrealized_pnl_usd,
      meta?.unrealizedPnlUsd,
    )

    positions.push({
      product,
      qty,
      ...(entryPrice === null ? {} : { entryPrice }),
      ...(markPrice === null ? {} : { markPrice }),
      ...(unrealizedPnlUsd === null ? {} : { unrealizedPnlUsd }),
    })
  }

  positions.sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty))
  return positions
}

function extractLastErrorFromText(text: string): string | null {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (/(error|exception|traceback|fatal|failed)/i.test(line)) {
      return redactSensitiveText(line).slice(0, 1000)
    }
  }
  return null
}

function parseTradeTimestamp(raw: any): string | null {
  return toIsoTimestamp(
    raw?.close_ts ??
      raw?.closeTs ??
      raw?.ts ??
      raw?.timestamp ??
      raw?.time ??
      raw?.filled_at ??
      raw?.filledAt,
  )
}

function normalizeTradeSide(raw: any): string | null {
  const text = pickFirstString(raw?.side, raw?.action, raw?.direction)
  if (!text) return null
  return text.toLowerCase()
}

export function normalizeTradesLimit(raw: unknown, defaultLimit = 50, maxLimit = 500): number {
  const n = asFiniteNumber(raw)
  if (n === null) return defaultLimit
  const parsed = Math.floor(n)
  if (parsed <= 0) return defaultLimit
  return Math.min(parsed, maxLimit)
}

export function resolveTraderPath(fileKey: TraderFileKey): string {
  return ALLOWED_ABS_PATHS[fileKey]
}

export function isAllowedTraderPath(targetPath: string): boolean {
  const normalized = path.resolve(String(targetPath || ''))
  return ALLOWED_ABS_PATH_SET.has(normalized)
}

export function getTraderHostAvailability(options?: { requireState?: boolean; requireTrades?: boolean }): AvailabilityResult {
  if (!fs.existsSync(TRADER_PROJECT_DIR)) {
    return { available: false, reason: `${TRADER_HOST_ONLY_REASON} Missing ${TRADER_PROJECT_RELATIVE_PATH}/.` }
  }

  let projectRealPath: string
  try {
    projectRealPath = fs.realpathSync(TRADER_PROJECT_DIR)
  } catch {
    return { available: false, reason: `${TRADER_HOST_ONLY_REASON} Unable to access ${TRADER_PROJECT_RELATIVE_PATH}/.` }
  }

  const workspaceRealPath = fs.existsSync(WORKSPACE_ROOT) ? fs.realpathSync(WORKSPACE_ROOT) : path.resolve(WORKSPACE_ROOT)
  if (!isPathInsideOrEqual(workspaceRealPath, projectRealPath)) {
    return { available: false, reason: `${TRADER_HOST_ONLY_REASON} Invalid trader project location.` }
  }

  if (options?.requireState && !fs.existsSync(resolveTraderPath('state'))) {
    return { available: false, reason: `${TRADER_HOST_ONLY_REASON} Missing ${TRADER_PROJECT_RELATIVE_PATH}/state.json.` }
  }

  if (options?.requireTrades && !fs.existsSync(resolveTraderPath('trades'))) {
    return { available: false, reason: `${TRADER_HOST_ONLY_REASON} Missing ${TRADER_PROJECT_RELATIVE_PATH}/trades.jsonl.` }
  }

  return { available: true }
}

export function readTraderStatusSnapshot(): TraderStatusSnapshot {
  const statePath = resolveSafeAllowlistedPath('state')
  const killSwitchPath = resolveSafeAllowlistedPath('killSwitch', { mustExist: false })
  const logPath = resolveSafeAllowlistedPath('log', { mustExist: false })

  const state = readJsonFile('state')
  const stateStat = fs.statSync(statePath)

  const mode = toSafeMode(state?.mode ?? state?.tradingMode ?? state?.portfolio?.mode)
  const equityUsd = pickFirstNumber(state?.equityUsd, state?.equity_usd, state?.portfolio?.equityUsd, state?.portfolio?.equity_usd)
  const cashUsd = pickFirstNumber(state?.cashUsd, state?.cash_usd, state?.portfolio?.cashUsd, state?.portfolio?.cash_usd)

  const rawOpenOrders = Array.isArray(state?.open_orders)
    ? state.open_orders
    : Array.isArray(state?.openOrders)
      ? state.openOrders
      : []

  const openOrdersCount = Math.max(0, Math.floor(pickFirstNumber(state?.openOrdersCount, state?.open_orders_count, rawOpenOrders.length, 0) || 0))

  const openOrders = rawOpenOrders.slice(0, 40).map((o: any) => ({
    id: pickFirstString(o?.id, o?.order_id),
    product: sanitizeProduct(o?.product),
    side: normalizeTradeSide(o),
    qtyBase: pickFirstNumber(o?.qty_base, o?.qty, o?.quantity, o?.size),
    status: pickFirstString(o?.status, o?.state),
  }))

  const products = Array.isArray(state?.products)
    ? state.products.map((p: unknown) => sanitizeProduct(p)).filter((p: string | null): p is string => Boolean(p))
    : []

  const openPositions = parseOpenPositions(state)
  const inferredProducts = new Set<string>(products)
  for (const position of openPositions) inferredProducts.add(position.product)
  if (state?.prices && typeof state.prices === 'object') {
    for (const key of Object.keys(state.prices)) {
      const safe = sanitizeProduct(key)
      if (safe) inferredProducts.add(safe)
    }
  }

  const risk = state?.risk && typeof state.risk === 'object' ? state.risk : {}
  const riskSnapshot: TraderRiskSnapshot = {
    drawdownHalt: Boolean(risk?.drawdown_halt),
    cooldownActive: Boolean(risk?.cooldown_active),
    drawdownPct: asFiniteNumber(risk?.drawdown_pct) ?? undefined,
    maxDrawdownSeenPct: asFiniteNumber(risk?.max_drawdown_seen_pct) ?? undefined,
    lossStreak: asFiniteNumber(risk?.loss_streak) ?? undefined,
    dayId: pickFirstString(risk?.day_id) || undefined,
    dayRealizedPnlUsd: asFiniteNumber(risk?.day_realized_pnl_usd) ?? undefined,
    dayStartEquityUsd: asFiniteNumber(risk?.day_start_equity_usd) ?? undefined,
    updatedTs: toIsoTimestamp(risk?.updated_ts),
  }

  const strategyParamsRaw = state?.strategy_params && typeof state.strategy_params === 'object' ? state.strategy_params : {}
  const strategyParams: TraderStrategyParamsSnapshot = {}
  for (const [k, v] of Object.entries(strategyParamsRaw)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      strategyParams[String(k)] = v as any
    }
  }

  const ai = state?.ai_strategist && typeof state.ai_strategist === 'object' ? state.ai_strategist : {}
  const aiState = ai?.state && typeof ai.state === 'object' ? ai.state : {}
  const aiStrategist: TraderAiStrategistSnapshot = {
    enabled: Boolean(ai?.enabled),
    provider: pickFirstString(ai?.provider),
    model: pickFirstString(ai?.model),
    state: {
      lastRunTs: toIsoTimestamp(aiState?.last_run_ts ?? aiState?.lastRunTs),
      lastChange: toIsoTimestamp(aiState?.last_change ?? aiState?.lastChange),
    },
  }

  let lastError: string | null = null
  if (fs.existsSync(logPath)) {
    try {
      lastError = extractLastErrorFromText(readUtf8Tail(logPath))
    } catch {
      // best effort
    }
  }

  return {
    mode,
    equityUsd,
    cashUsd,
    openPositions,
    openOrdersCount,
    openOrders,
    risk: riskSnapshot,
    strategyParams,
    aiStrategist,
    products: Array.from(inferredProducts).sort(),
    lastRunTs:
      toIsoTimestamp(state?.ts ?? state?.timestamp ?? state?.lastRunTs ?? state?.last_run_ts ?? state?.updatedAt) ||
      new Date(stateStat.mtimeMs).toISOString(),
    lastError,
    killSwitchEnabled: fs.existsSync(killSwitchPath),
  }
}

export function parseTradeRow(raw: any): TraderTradeRow | null {
  if (!raw || typeof raw !== 'object') return null

  // Contract: trades.jsonl contains type="closed_trade" entries.
  // If type is present and not closed_trade, ignore the line.
  const rawType = asTrimmedString((raw as any)?.type)
  if (rawType && rawType.toLowerCase() !== 'closed_trade') return null

  const product = sanitizeProduct(raw?.product ?? raw?.symbol ?? raw?.instrument ?? raw?.market)
  if (!product) return null

  const reason = pickFirstString(raw?.reason, raw?.note, raw?.signal, raw?.strategyReason, raw?.meta?.reason)

  return {
    id: pickFirstString(raw?.id, raw?.trade_id, raw?.tradeId),
    type: 'closed_trade',
    product,
    side: normalizeTradeSide(raw),
    qtyBase: pickFirstNumber(raw?.qty_base, raw?.qty, raw?.quantity, raw?.size, raw?.amount),
    entryPrice: pickFirstNumber(raw?.entry_price, raw?.entryPrice),
    exitPrice: pickFirstNumber(raw?.exit_price, raw?.exitPrice),
    pnlUsd: pickFirstNumber(raw?.pnl_usd, raw?.pnlUsd, raw?.realized_pnl_usd, raw?.realizedPnlUsd, raw?.pnl),
    pnlPct: pickFirstNumber(raw?.pnl_pct, raw?.pnlPct),
    openTs: toIsoTimestamp(raw?.open_ts ?? raw?.openTs),
    closeTs: toIsoTimestamp(raw?.close_ts ?? raw?.closeTs) || parseTradeTimestamp(raw),
    reason: reason ? redactSensitiveText(reason) : null,
  }
}

export function tailJsonlRowsFromFile(filePath: string, limit: number, options?: JsonlTailOptions): TraderTradeRow[] {
  const safeLimit = normalizeTradesLimit(limit)
  if (safeLimit <= 0) return []

  const initialBytes = Math.max(512, Math.floor(options?.initialBytes || 64 * 1024))
  const maxBytes = Math.max(initialBytes, Math.floor(options?.maxBytes || 4 * 1024 * 1024))
  const maxPasses = Math.max(1, Math.floor(options?.maxPasses || 8))

  const stat = fs.statSync(filePath)
  if (stat.size <= 0) return []

  let readBytes = initialBytes
  let text = ''
  let bestCandidateLines: string[] = []

  const collectCandidateLines = (source: string, isFullRead: boolean): string[] => {
    const parts = source.split(/\r?\n/)
    // Tail reads can start in the middle of a line. Drop the potentially partial
    // first fragment unless we know we read from byte 0.
    if (!isFullRead && parts.length > 0) parts.shift()
    return parts.map((line) => line.trim()).filter(Boolean)
  }

  const countParsableRows = (candidateLines: string[], maxRows: number): number => {
    let count = 0
    for (let i = candidateLines.length - 1; i >= 0 && count < maxRows; i -= 1) {
      try {
        const parsed = JSON.parse(candidateLines[i])
        if (parseTradeRow(parsed)) count += 1
      } catch {
        // skip malformed rows while probing
      }
    }
    return count
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const start = Math.max(0, stat.size - readBytes)
    const length = stat.size - start
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      fs.readSync(fd, buf, 0, length, start)
      text = buf.toString('utf-8')
    } finally {
      fs.closeSync(fd)
    }

    const candidateLines = collectCandidateLines(text, start === 0)
    bestCandidateLines = candidateLines
    const parsableRows = countParsableRows(candidateLines, safeLimit)
    if (start === 0 || parsableRows >= safeLimit) break

    readBytes = Math.min(maxBytes, readBytes * 2)
    if (readBytes >= stat.size) {
      readBytes = stat.size
    }
  }

  const rows: TraderTradeRow[] = []
  for (let i = bestCandidateLines.length - 1; i >= 0 && rows.length < safeLimit; i -= 1) {
    const line = bestCandidateLines[i]
    try {
      const parsed = JSON.parse(line)
      const row = parseTradeRow(parsed)
      if (row) rows.push(row)
    } catch {
      // skip malformed rows
    }
  }

  // We push from newest -> oldest, so keep it that way.
  return rows
}

export function readTraderTrades(limit: number): TraderTradeRow[] {
  const tradesPath = resolveSafeAllowlistedPath('trades')
  return tailJsonlRowsFromFile(tradesPath, limit)
}

export function setKillSwitchEnabled(enabled: boolean): boolean {
  const killSwitchPath = resolveSafeAllowlistedPath('killSwitch', { mustExist: false })

  if (enabled) {
    const payload = `enabled_at=${new Date().toISOString()}\nsource=mission-center\n`
    fs.writeFileSync(killSwitchPath, payload, 'utf-8')
    return true
  }

  if (fs.existsSync(killSwitchPath)) {
    fs.unlinkSync(killSwitchPath)
  }
  return false
}

export default {
  TRADER_ALLOWED_FILES,
  TRADER_HOST_ONLY_REASON,
  TRADER_PROJECT_DIR,
  TRADER_PROJECT_RELATIVE_PATH,
  getTraderHostAvailability,
  isAllowedTraderPath,
  normalizeTradesLimit,
  parseTradeRow,
  readTraderStatusSnapshot,
  readTraderTrades,
  resolveTraderPath,
  setKillSwitchEnabled,
  tailJsonlRowsFromFile,
}
