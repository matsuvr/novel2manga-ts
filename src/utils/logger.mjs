import fs from 'node:fs'
import path from 'node:path'

/**
 * ログをファイルに保存するためのユーティリティ
 */
class FileLogger {
  constructor() {
    this.logDir = path.resolve(process.cwd(), 'logs')
    this.currentDate = ''
    this.logFilePath = ''
    this.ensureLogDirectory()
    this.setupLogFile()
  }

  static getInstance() {
    if (!FileLogger.instance) {
      FileLogger.instance = new FileLogger()
    }
    return FileLogger.instance
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  setupLogFile() {
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

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFilePath, message, 'utf8')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  log(message) {
    this.setupLogFile() // 日付チェック
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    this.writeToFile(logMessage)
  }

  logError(error) {
    const errorMessage = error instanceof Error ? error.stack || error.message : error
    this.log(`ERROR: ${errorMessage}`)
  }

  logInfo(message) {
    this.log(`INFO: ${message}`)
  }

  logDebug(message) {
    this.log(`DEBUG: ${message}`)
  }

  getLogFilePath() {
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

console.log = (...args) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleLog(...args)
  fileLogger.log(`LOG: ${message}`)
}

console.error = (...args) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleError(...args)
  fileLogger.log(`ERROR: ${message}`)
}

console.warn = (...args) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleWarn(...args)
  fileLogger.log(`WARN: ${message}`)
}

console.info = (...args) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ')

  originalConsoleInfo(...args)
  fileLogger.log(`INFO: ${message}`)
}

export { FileLogger, fileLogger }
