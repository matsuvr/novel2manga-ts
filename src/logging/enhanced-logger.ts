/**
 * Enhanced Logging System for V2 Extraction
 * Structured logging with detailed tracking and error handling
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CharacterId, ExtractionV2, TempCharacterId } from '@/types/extractionV2'

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: unknown
  error?: Error | unknown
  context?: LogContext
}

/**
 * Logging context for tracking operations
 */
export interface LogContext {
  jobId?: string
  novelId?: string
  chunkIndex?: number
  characterId?: CharacterId | TempCharacterId
  operation?: string
  duration?: number
}

/**
 * Character operation log
 */
export interface CharacterOperationLog {
  timestamp: string
  operation: 'merge' | 'create' | 'update' | 'resolve'
  tempId?: TempCharacterId
  stableId?: CharacterId
  confidence?: number
  method?: string
  details?: unknown
}

/**
 * Extraction metrics
 */
export interface ExtractionMetrics {
  chunkIndex: number
  processingTime: number
  charactersFound: number
  eventsRecorded: number
  dialoguesExtracted: number
  speakersResolved: number
  memorySize: number
  errors: number
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel
  logDir?: string
  enableConsole?: boolean
  enableFile?: boolean
  enableMetrics?: boolean
  enableCharacterTracking?: boolean
  maxFileSize?: number // bytes
  rotateDaily?: boolean
}

/**
 * Enhanced logger implementation
 */
export class EnhancedLogger {
  private config: LoggerConfig
  private logFilePath?: string
  private metricsFilePath?: string
  private characterLogPath?: string
  private metrics: ExtractionMetrics[] = []
  private characterOps: CharacterOperationLog[] = []

  constructor(config: LoggerConfig) {
    this.config = config

    if (config.enableFile && config.logDir) {
      this.initializeFileLogging(config.logDir)
    }
  }

  private initializeFileLogging(logDir: string): void {
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().split('T')[0]
    this.logFilePath = path.join(logDir, `extraction-${timestamp}.log`)
    this.metricsFilePath = path.join(logDir, `metrics-${timestamp}.json`)
    this.characterLogPath = path.join(logDir, `characters-${timestamp}.json`)
  }

  /**
   * Core logging method
   */
  private log(entry: LogEntry): void {
    if (entry.level > this.config.level) {
      return
    }

    const formattedEntry = this.formatLogEntry(entry)

    if (this.config.enableConsole) {
      this.logToConsole(entry, formattedEntry)
    }

    if (this.config.enableFile && this.logFilePath) {
      this.logToFile(formattedEntry)
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const level = LogLevel[entry.level]
    const context = entry.context
      ? ` [${Object.entries(entry.context)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => `${k}:${v}`)
          .join(' ')}]`
      : ''

    let message = `${entry.timestamp} ${level} [${entry.component}]${context} ${entry.message}`

    if (entry.data) {
      message += ` ${JSON.stringify(entry.data)}`
    }

    if (entry.error) {
      const errorDetails =
        entry.error instanceof Error
          ? `${entry.error.name}: ${entry.error.message}\n${entry.error.stack}`
          : JSON.stringify(entry.error)
      message += `\nError: ${errorDetails}`
    }

    return message
  }

  private logToConsole(entry: LogEntry, formatted: string): void {
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.INFO:
        console.info(formatted)
        break
      case LogLevel.DEBUG:
      case LogLevel.TRACE:
        console.log(formatted)
        break
    }
  }

  private logToFile(message: string): void {
    if (!this.logFilePath) return

    try {
      appendFileSync(this.logFilePath, `${message}\n`)

      // Check file size for rotation
      if (this.config.maxFileSize) {
        const stats = require('node:fs').statSync(this.logFilePath)
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogFile()
        }
      }
    } catch (error) {
      console.error('Failed to write log to file:', error)
    }
  }

  private rotateLogFile(): void {
    if (!this.logFilePath) return

    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const rotatedPath = this.logFilePath.replace('.log', `-${timestamp}.log`)

    try {
      require('node:fs').renameSync(this.logFilePath, rotatedPath)
    } catch (error) {
      console.error('Failed to rotate log file:', error)
    }
  }

  // Public logging methods

  error(component: string, message: string, error?: Error | unknown, context?: LogContext): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      component,
      message,
      error,
      context,
    })
  }

  warn(component: string, message: string, data?: unknown, context?: LogContext): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      component,
      message,
      data,
      context,
    })
  }

  info(component: string, message: string, data?: unknown, context?: LogContext): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      component,
      message,
      data,
      context,
    })
  }

  debug(component: string, message: string, data?: unknown, context?: LogContext): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      component,
      message,
      data,
      context,
    })
  }

  trace(component: string, message: string, data?: unknown, context?: LogContext): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.TRACE,
      component,
      message,
      data,
      context,
    })
  }

  /**
   * Log character operation
   */
  logCharacterOperation(operation: CharacterOperationLog): void {
    if (!this.config.enableCharacterTracking) return

    this.characterOps.push(operation)

    // Also log as debug
    this.debug('CharacterState', `Character ${operation.operation}`, operation, {
      characterId: operation.stableId,
    })

    // Persist to file
    if (this.characterLogPath) {
      try {
        writeFileSync(this.characterLogPath, JSON.stringify(this.characterOps, null, 2))
      } catch (error) {
        this.error('Logger', 'Failed to write character log', error)
      }
    }
  }

  /**
   * Log extraction metrics
   */
  logMetrics(metrics: ExtractionMetrics): void {
    if (!this.config.enableMetrics) return

    this.metrics.push(metrics)

    this.info(
      'Metrics',
      `Chunk ${metrics.chunkIndex} processed`,
      {
        time: `${metrics.processingTime}ms`,
        characters: metrics.charactersFound,
        events: metrics.eventsRecorded,
        dialogues: metrics.dialoguesExtracted,
        resolved: metrics.speakersResolved,
      },
      { chunkIndex: metrics.chunkIndex },
    )

    // Persist metrics
    if (this.metricsFilePath) {
      try {
        writeFileSync(this.metricsFilePath, JSON.stringify(this.metrics, null, 2))
      } catch (error) {
        this.error('Logger', 'Failed to write metrics', error)
      }
    }
  }

  /**
   * Generate summary report
   */
  generateSummary(): string {
    const totalChunks = this.metrics.length
    const totalTime = this.metrics.reduce((sum, m) => sum + m.processingTime, 0)
    const totalCharacters = new Set(
      this.characterOps.filter((op) => op.operation === 'create').map((op) => op.stableId),
    ).size
    const totalMerges = this.characterOps.filter((op) => op.operation === 'merge').length
    const totalErrors = this.metrics.reduce((sum, m) => sum + m.errors, 0)

    return `
=== Extraction Summary ===
Total Chunks: ${totalChunks}
Processing Time: ${(totalTime / 1000).toFixed(2)}s
Average Time/Chunk: ${(totalTime / totalChunks).toFixed(0)}ms

Characters: ${totalCharacters} unique
Merges: ${totalMerges}
Errors: ${totalErrors}

Metrics by Chunk:
${this.metrics
  .map(
    (m) =>
      `  Chunk ${m.chunkIndex}: ${m.charactersFound} chars, ${m.eventsRecorded} events, ${m.dialoguesExtracted} dialogues (${m.processingTime}ms)`,
  )
  .join('\n')}
`
  }
}

/**
 * Error handler for extraction pipeline
 */
export class ExtractionErrorHandler {
  private logger: EnhancedLogger
  private maxRetries: number
  private retryDelays: number[]

  constructor(logger: EnhancedLogger, maxRetries = 3) {
    this.logger = logger
    this.maxRetries = maxRetries
    this.retryDelays = [1000, 2000, 5000] // ms
  }

  /**
   * Handle extraction error with retry logic
   */
  async handleExtractionError<T>(
    operation: () => Promise<T>,
    context: LogContext,
    errorMessage: string,
  ): Promise<T | null> {
    let lastError: Error | unknown

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        this.logger.error(
          'ExtractionError',
          `${errorMessage} (attempt ${attempt + 1}/${this.maxRetries})`,
          error,
          context,
        )

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt] || 5000
          this.logger.debug('Retry', `Waiting ${delay}ms before retry`, null, context)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    this.logger.error(
      'ExtractionError',
      `${errorMessage} - Max retries exceeded`,
      lastError,
      context,
    )

    return null
  }

  /**
   * Validate extraction result
   */
  validateExtraction(
    extraction: ExtractionV2,
    chunkIndex: number,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check for required fields
    if (!extraction.characters) {
      errors.push('Missing characters array')
    }
    if (!extraction.characterEvents) {
      errors.push('Missing characterEvents array')
    }
    if (!extraction.dialogues) {
      errors.push('Missing dialogues array')
    }
    if (!extraction.scenes) {
      errors.push('Missing scenes array')
    }
    if (!extraction.highlights) {
      errors.push('Missing highlights array')
    }
    if (!extraction.situations) {
      errors.push('Missing situations array')
    }

    // Validate character IDs format
    for (const char of extraction.characters || []) {
      if (!char.id.match(/^(char_\d+|temp_char_\d+_\d+)$/)) {
        errors.push(`Invalid character ID format: ${char.id}`)
      }
    }

    // Validate indices
    for (const event of extraction.characterEvents || []) {
      if (event.index < 0) {
        errors.push(`Negative index in character event: ${event.index}`)
      }
    }

    if (errors.length > 0) {
      this.logger.warn('Validation', 'Extraction validation failed', errors, { chunkIndex })
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

/**
 * Performance tracker
 */
export class PerformanceTracker {
  private timers: Map<string, number> = new Map()
  private logger: EnhancedLogger

  constructor(logger: EnhancedLogger) {
    this.logger = logger
  }

  start(operation: string): void {
    this.timers.set(operation, Date.now())
    this.logger.trace('Performance', `Started: ${operation}`)
  }

  end(operation: string, context?: LogContext): number {
    const startTime = this.timers.get(operation)
    if (!startTime) {
      this.logger.warn('Performance', `No start time for operation: ${operation}`)
      return 0
    }

    const duration = Date.now() - startTime
    this.timers.delete(operation)

    this.logger.debug(
      'Performance',
      `Completed: ${operation}`,
      { duration: `${duration}ms` },
      context,
    )

    return duration
  }

  measure<T>(operation: string, fn: () => T, context?: LogContext): T {
    this.start(operation)
    try {
      const result = fn()
      return result
    } finally {
      this.end(operation, context)
    }
  }

  async measureAsync<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    this.start(operation)
    try {
      const result = await fn()
      return result
    } finally {
      this.end(operation, context)
    }
  }
}

/**
 * Create default logger instance
 */
export function createLogger(level: LogLevel = LogLevel.INFO, logDir?: string): EnhancedLogger {
  return new EnhancedLogger({
    level,
    logDir,
    enableConsole: true,
    enableFile: !!logDir,
    enableMetrics: true,
    enableCharacterTracking: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    rotateDaily: true,
  })
}
