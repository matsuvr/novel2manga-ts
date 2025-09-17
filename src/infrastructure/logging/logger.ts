// ---------------------------------------------------------------------------
// Pure Logger Implementation (import = zero side-effects)
// Requirements:
//  - Import時にファイル生成/console出力を一切行わない
//  - build phase (Next.js production build) 中に getLogger() しても No-Op
//  - ランタイムで初めて getLogger() が呼ばれた時のみ初期化
//  - 環境変数は最小限: LOG_LEVEL, ENABLE_FILE_LOG (任意)。
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelOrder: LogLevel[] = ['debug', 'info', 'warn', 'error']
const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build'

function normalizeLevel(raw: unknown): LogLevel {
  const v = String(raw || '').toLowerCase()
  return (levelOrder.includes(v as LogLevel) ? v : 'info') as LogLevel
}

export interface LoggerPort {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  withContext(ctx: Record<string, unknown>): LoggerPort
}

type LogContext = Record<string, unknown>
const ctxStore = new AsyncLocalStorage<LogContext>()
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return ctxStore.run(ctx, fn)
}
export function getLogContext(): LogContext | undefined {
  return ctxStore.getStore()
}

class NoopLogger implements LoggerPort {
  debug(): void { void 0 }
  info(): void { void 0 }
  warn(): void { void 0 }
  error(): void { void 0 }
  withContext(): LoggerPort { return this }
}

class BasicConsoleLogger implements LoggerPort {
  constructor(private readonly base: Record<string, unknown> = {}, private readonly min: LogLevel = 'info') {}
  private allow(level: LogLevel) { return levelOrder.indexOf(level) >= levelOrder.indexOf(this.min) }
  private line(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (!this.allow(level)) return
    const merged = { ts: new Date().toISOString(), level, msg, ...this.base, ...(getLogContext()||{}), ...(meta||{}) }
    const str = JSON.stringify(merged)
  // eslint-disable-next-line no-console
  const method: 'debug' | 'info' | 'warn' | 'error' = level === 'debug' ? 'debug' : level
  console[method](str)
  }
  debug(m: string, meta?: Record<string, unknown>) { this.line('debug', m, meta) }
  info(m: string, meta?: Record<string, unknown>) { this.line('info', m, meta) }
  warn(m: string, meta?: Record<string, unknown>) { this.line('warn', m, meta) }
  error(m: string, meta?: Record<string, unknown>) { this.line('error', m, meta) }
  withContext(ctx: Record<string, unknown>): LoggerPort { return new BasicConsoleLogger({ ...this.base, ...ctx }, this.min) }
}

class LazyFileLogger implements LoggerPort {
  private stream: fs.WriteStream | null = null
  constructor(private readonly filePath: string, private readonly base: Record<string, unknown> = {}, private readonly min: LogLevel = 'debug') {}
  private ensure() {
    if (this.stream) return
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      this.stream = fs.createWriteStream(this.filePath, { flags: 'a', encoding: 'utf8' })
    } catch {
      this.stream = null
    }
  }
  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (levelOrder.indexOf(level) < levelOrder.indexOf(this.min)) return
    this.ensure()
    if (!this.stream) return
    const rec = { ts: new Date().toISOString(), level, msg, ...this.base, ...(getLogContext()||{}), ...(meta||{}) }
    this.stream.write(`${JSON.stringify(rec)}
`)
  }
  debug(m: string, meta?: Record<string, unknown>) { this.write('debug', m, meta) }
  info(m: string, meta?: Record<string, unknown>) { this.write('info', m, meta) }
  warn(m: string, meta?: Record<string, unknown>) { this.write('warn', m, meta) }
  error(m: string, meta?: Record<string, unknown>) { this.write('error', m, meta) }
  withContext(ctx: Record<string, unknown>): LoggerPort { return new LazyFileLogger(this.filePath, { ...this.base, ...ctx }, this.min) }
  getFilePath() { return this.filePath }
}

class Combined implements LoggerPort {
  constructor(private readonly parts: LoggerPort[]) {}
  debug(m: string, meta?: Record<string, unknown>) { for (const p of this.parts) p.debug(m, meta) }
  info(m: string, meta?: Record<string, unknown>) { for (const p of this.parts) p.info(m, meta) }
  warn(m: string, meta?: Record<string, unknown>) { for (const p of this.parts) p.warn(m, meta) }
  error(m: string, meta?: Record<string, unknown>) { for (const p of this.parts) p.error(m, meta) }
  withContext(ctx: Record<string, unknown>): LoggerPort { return new Combined(this.parts.map(p => p.withContext(ctx))) }
}

let singleton: LoggerPort | null = null

export function getLogger(): LoggerPort {
  if (singleton) return singleton
  // Build phase: 常に no-op （ビルド純化）。
  if (isBuildPhase()) {
    singleton = new NoopLogger()
    return singleton
  }
  const level = normalizeLevel(process.env.LOG_LEVEL)
  const consoleLogger = new BasicConsoleLogger({}, level)
  const enableFile = process.env.ENABLE_FILE_LOG === '1'
  singleton = enableFile
    ? new Combined([
        consoleLogger,
        new LazyFileLogger(
          path.resolve(process.cwd(), 'logs', `app-${new Date().toISOString().split('T')[0]}.log`),
        ),
      ])
    : consoleLogger
  return singleton
}
// fileLogger 後方互換 API は撤廃しました。
