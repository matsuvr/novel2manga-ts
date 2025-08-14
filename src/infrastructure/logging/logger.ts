export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerPort {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  withContext(ctx: Record<string, unknown>): LoggerPort
}

class ConsoleLogger implements LoggerPort {
  constructor(private readonly base: Record<string, unknown> = {}) {}

  private fmt(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    const payload = { ts: new Date().toISOString(), level, msg, ...this.base, ...(meta || {}) }
    const line = JSON.stringify(payload)
    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(line)
        break
      case 'info':
        // eslint-disable-next-line no-console
        console.info(line)
        break
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(line)
        break
      case 'error':
        // eslint-disable-next-line no-console
        console.error(line)
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
    return new ConsoleLogger({ ...this.base, ...ctx })
  }
}

let defaultLogger: LoggerPort | null = null

export function getLogger(): LoggerPort {
  if (!defaultLogger) defaultLogger = new ConsoleLogger()
  return defaultLogger
}
