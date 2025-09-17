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
      // ここで console.error を呼ぶとパッチ後は再帰するので元のエラー出力に直接書く
      try {
        if (typeof originalConsoleError === 'function') {
          originalConsoleError('Failed to write to log file:', error)
        } else {
          // 最低限標準エラー出力
          process.stderr.write(`Failed to write to log file: ${String(error)}\n`)
        }
      } catch {
        // ここでさらに失敗しても握りつぶす（無限ループ防止）
      }
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

// ========= Logging activation guards =========
// ビルドや本番 (NODE_ENV !== 'development') ではファイルロギングと console モンキーパッチを無効化
// DISABLE_LOGGING=1 または DISABLE_FILE_LOGGER=1 も尊重
const disableLogging = String(process.env.DISABLE_LOGGING || '').trim() === '1'
const disableFileLoggerEnv = String(process.env.DISABLE_FILE_LOGGER || '').trim() === '1'
const isDevelopmentRuntime = process.env.NODE_ENV === 'development'
const enableFilePatch = isDevelopmentRuntime && !disableLogging && !disableFileLoggerEnv

// 元の console 参照をキャプチャし再帰回避用に外に出す
// eslint-disable-next-line no-var
var originalConsoleError = console.error.bind(console)
const originalConsoleLog = console.log.bind(console)
const originalConsoleWarn = console.warn.bind(console)
const originalConsoleInfo = console.info.bind(console)

let fileLogger = null
if (enableFilePatch) {
  fileLogger = FileLogger.getInstance()

  console.log = (...args) => {
    originalConsoleLog(...args)
    try {
      const message = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
      fileLogger?.log(`LOG: ${message}`)
    } catch {
      /* noop */
    }
  }
  console.error = (...args) => {
    originalConsoleError(...args)
    try {
      const message = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
      fileLogger?.log(`ERROR: ${message}`)
    } catch {
      /* noop */
    }
  }
  console.warn = (...args) => {
    originalConsoleWarn(...args)
    try {
      const message = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
      fileLogger?.log(`WARN: ${message}`)
    } catch {
      /* noop */
    }
  }
  console.info = (...args) => {
    originalConsoleInfo(...args)
    try {
      const message = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
        .join(' ')
      fileLogger?.log(`INFO: ${message}`)
    } catch {
      /* noop */
    }
  }
}

// build/production/test では副作用無し: ファイル出力無しでエラー無しを保証

export { FileLogger, fileLogger }
