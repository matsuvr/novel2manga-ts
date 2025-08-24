import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDatabaseConfig } from '@/config'
// Import will be added when migration is complete to avoid circular dependency
import * as schema from './schema'
import { cleanup } from '@/services/database/database-service-factory'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

// Setup cleanup handlers for graceful shutdown
if (typeof process !== 'undefined') {
  const handleShutdown = () => {
    cleanup()
    if (db) {
      db = null
    }
  }

  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)
  process.on('exit', handleShutdown)
}

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    const dbConfig = getDatabaseConfig()
    const dbPath = dbConfig.sqlite.path || './database/novel2manga.db'

    // Ensure the directory exists
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    try {
      const sqliteDb = new Database(dbPath)
      db = drizzle(sqliteDb, { schema })

      // TODO: Initialize the new database service architecture when migration is complete
      // initializeDatabaseServiceFactory(db)
    } catch (error) {
      // 特定: ネイティブモジュール ABI 不一致 (ERR_DLOPEN_FAILED) などのロード失敗を捕捉
      const msg = error instanceof Error ? error.message : String(error)
      const isAbiMismatch = /NODE_MODULE_VERSION/i.test(msg) || /ERR_DLOPEN_FAILED/i.test(msg)
      if (isAbiMismatch) {
        console.error(
          '[Database:init] better-sqlite3 のネイティブモジュール読み込みに失敗しました (ABI mismatch 可能性)',
          {
            message: msg,
            hint: '再ビルド手順: npm rebuild better-sqlite3 もしくは node_modules 再生成 (postinstall で自動実行設定済み)',
            steps: [
              'npm rebuild better-sqlite3',
              'rm -rf node_modules package-lock.json',
              'npm ci',
            ],
            nodeVersion: process.version,
            cwd: process.cwd(),
          },
        )
      } else {
        console.error('[Database:init] 予期しない初期化エラー', msg)
      }
      throw error
    }

    // Run migrations automatically in development/test environments
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST
    ) {
      try {
        migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
      } catch (error) {
        console.warn('Migration failed, continuing without migrations:', error)
      }
    }
  }

  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export { schema }
export * from './schema'
