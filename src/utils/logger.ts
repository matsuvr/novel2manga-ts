import fs from 'node:fs'
import path from 'node:path'

/**
 * ログをファイルに保存するためのユーティリティ
 */
export class FileLogger {
  private static instance: FileLogger
  private logDir: string
  private currentDate: string
  private logFilePath: string

  private constructor() {
    this.logDir = path.resolve(process.cwd(), 'logs')
    this.currentDate = ''
    this.logFilePath = ''
    this.ensureLogDirectory()
    this.setupLogFile()
  }

  public static getInstance(): FileLogger {
    if (!FileLogger.instance) {
      FileLogger.instance = new FileLogger()
    }
    return FileLogger.instance
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private setupLogFile(): void {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // 日付が変わった場合は新しいファイルを作成
    if (this.currentDate !== today) {
      this.currentDate = today
      this.logFilePath = path.join(this.logDir, `dev-${today}.log`)

      // 新しいログファイルの開始マーカー
      if (!fs.existsSync(this.logFilePath)) {
        this.writeToFile(`\n=== Dev Server Log Started: ${new Date().toISOString()} ===\n`)
      } else {
        this.writeToFile(`\n=== Dev Server Restarted: ${new Date().toISOString()} ===\n`)
      }
    }
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.logFilePath, message, 'utf8')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  public log(message: string): void {
    this.setupLogFile() // 日付チェック
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    this.writeToFile(logMessage)
  }

  public logError(error: string | Error): void {
    const errorMessage = error instanceof Error ? error.stack || error.message : error
    this.log(`ERROR: ${errorMessage}`)
  }

  public logInfo(message: string): void {
    this.log(`INFO: ${message}`)
  }

  public logDebug(message: string): void {
    this.log(`DEBUG: ${message}`)
  }

  public getLogFilePath(): string {
    this.setupLogFile()
    return this.logFilePath
  }
}

// グローバルなコンソール出力をインターセプトしてファイルにも出力
const fileLogger = FileLogger.getInstance()

const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
const originalConsoleInfo = console.info

console.log = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleLog(...args)
  fileLogger.log(`LOG: ${message}`)
}

console.error = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleError(...args)
  fileLogger.log(`ERROR: ${message}`)
}

console.warn = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleWarn(...args)
  fileLogger.log(`WARN: ${message}`)
}

console.info = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleInfo(...args)
  fileLogger.log(`INFO: ${message}`)
}

export { fileLogger }
