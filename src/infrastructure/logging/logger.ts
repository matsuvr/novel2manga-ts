import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function levelPriority(level: LogLevel): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'warn':
      return 30
    case 'error':
      return 40
  }
}

function parseConsoleLevel(envValue: unknown): LogLevel {
  const v = String(envValue || '').toLowerCase()
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v
  // 既定は info: サーバー処理は見えるが、SSEは個別に抑制可能にする。
  return 'info'
}

export interface LoggerPort {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  withContext(ctx: Record<string, unknown>): LoggerPort
}

type LogContext = {
  muteConsole?: boolean
  consoleMinLevel?: LogLevel
} & Record<string, unknown>

// リクエスト毎のロギングコンテキスト
const logContextStorage = new AsyncLocalStorage<LogContext>()

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return logContextStorage.run(ctx, fn)
}

export function getLogContext(): LogContext | undefined {
  return logContextStorage.getStore()
}

class ConsoleLogger implements LoggerPort {
  constructor(
    private readonly base: Record<string, unknown> = {},
    private readonly minLevel: LogLevel = 'info',
  ) {}

  private fmt(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    // レベルフィルタ（コンソールのみ）。ファイル出力は全レベル維持。
    const ctx = getLogContext()
    const effMin = (ctx?.consoleMinLevel as LogLevel | undefined) ?? this.minLevel
    if (levelPriority(level) < levelPriority(effMin)) return
    // きめ細かいサプレッション: DatabaseService.getJob の "getJob result" はコンソール抑止
    // （SSE等で高頻度に出て可読性を損なうため）。ファイルログには残る。
    const baseService = (this.base?.service as string | undefined) || ''
    const baseMethod = (this.base?.method as string | undefined) || ''
    if (baseService === 'DatabaseService' && baseMethod === 'getJob' && msg === 'getJob result') {
      return
    }
    const payload = { ts: new Date().toISOString(), level, msg, ...this.base, ...(meta || {}) }
    const line = JSON.stringify(payload)
    const mute = ctx?.muteConsole === true
    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        if (!mute) console.debug(line)
        break
      case 'info':
        // eslint-disable-next-line no-console
        if (!mute) console.info(line)
        break
      case 'warn':
        // eslint-disable-next-line no-console
        if (!mute) console.warn(line)
        break
      case 'error':
        // eslint-disable-next-line no-console
        if (!mute) console.error(line)
        break
    }
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.fmt('debug', msg, meta)
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.fmt('info', msg, meta)
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.fmt('warn', msg, meta)
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.fmt('error', msg, meta)
  }
  withContext(ctx: Record<string, unknown>): LoggerPort {
    return new ConsoleLogger({ ...this.base, ...ctx }, this.minLevel)
  }
}

class FileLogger implements LoggerPort {
  private stream: fs.WriteStream | null = null
  constructor(
    private readonly filePath: string,
    private readonly base: Record<string, unknown> = {},
  ) {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      this.stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' })
    } catch {
      this.stream = null
    }
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (!this.stream) return
    const payload = { ts: new Date().toISOString(), level, msg, ...this.base, ...(meta || {}) }
    this.stream.write(`${JSON.stringify(payload)}\n`)
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.write('debug', msg, meta)
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.write('info', msg, meta)
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.write('warn', msg, meta)
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.write('error', msg, meta)
  }
  withContext(ctx: Record<string, unknown>): LoggerPort {
    return new FileLogger(this.filePath, { ...this.base, ...ctx })
  }
}

class MultiLogger implements LoggerPort {
  constructor(private readonly loggers: LoggerPort[]) {}
  debug(msg: string, meta?: Record<string, unknown>): void {
    for (const l of this.loggers) {
      l.debug(msg, meta)
    }
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    for (const l of this.loggers) {
      l.info(msg, meta)
    }
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    for (const l of this.loggers) {
      l.warn(msg, meta)
    }
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    for (const l of this.loggers) {
      l.error(msg, meta)
    }
  }
  withContext(ctx: Record<string, unknown>): LoggerPort {
    return new MultiLogger(this.loggers.map((l) => l.withContext(ctx)))
  }
}

let defaultLogger: LoggerPort | null = null

export function getLogger(): LoggerPort {
  if (!defaultLogger) {
    const consoleMinLevel = parseConsoleLevel(process.env.LOG_CONSOLE_LEVEL)
    const consoleLogger = new ConsoleLogger({}, consoleMinLevel)
    // Always write dev logs to ./dev.log in development and tests; also allow in production for now
    const devLogPath = path.resolve(process.cwd(), 'dev.log')
    const fileLogger = new FileLogger(devLogPath)
    defaultLogger = new MultiLogger([consoleLogger, fileLogger])
  }
  return defaultLogger
}
