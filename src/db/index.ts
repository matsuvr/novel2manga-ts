import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDatabaseConfig } from '@/config'
import { createDatabaseConnection } from '@/infrastructure/database/connection'
import { getLogger } from '@/infrastructure/logging/logger'
import {
  cleanup,
  initializeDatabaseServiceFactory,
} from '@/services/database/database-service-factory'
import * as schema from './schema'

const require = createRequire(import.meta.url)
let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let rebuildAttempted = false

function isNativeModuleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /NODE_MODULE_VERSION/i.test(message) ||
    /ERR_DLOPEN_FAILED/i.test(message) ||
    /did not self-register/i.test(message)
  )
}

function rebuildBetterSqlite3(): void {
  const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`npm rebuild better-sqlite3 failed with code ${result.status}`)
  }
}

function loadBetterSqlite3(reload = false) {
  if (reload) {
    delete require.cache[require.resolve('better-sqlite3')]
  }
  return require('better-sqlite3') as typeof import('better-sqlite3')
}

export function shouldRunMigrations(env: NodeJS.ProcessEnv = process.env): boolean {
  const skipMigrate = env.DB_SKIP_MIGRATE === '1'
  if (skipMigrate) return false
  const nodeEnv = env.NODE_ENV
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test'
  const isVitest = Boolean(env.VITEST)
  return isDevOrTest || isVitest
}

// Setup cleanup handlers for graceful shutdown (register once in dev/HMR)
if (typeof process !== 'undefined') {
  // Use a global flag to prevent duplicate listener registration across HMR reloads
  const g = globalThis as unknown as { __n2m_db_cleanup_registered__?: boolean }
  if (!g.__n2m_db_cleanup_registered__) {
    const handleShutdown = () => {
      try {
        cleanup()
      } catch {
        // ignore cleanup errors intentionally (no fallback behavior)
      }
      if (db) {
        db = null
      }
    }

    // Use once-listeners to avoid accumulation
    process.once('SIGINT', handleShutdown)
    process.once('SIGTERM', handleShutdown)
    process.once('exit', handleShutdown)
    g.__n2m_db_cleanup_registered__ = true
  }
}

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    const dbConfig = getDatabaseConfig()
    // テスト環境では既存ファイルDBのスキーマ差分によりマイグレーション競合が起きやすい。
    // テスト簡素化のため、明示オプションが無い限り in-memory を使用する。
    const useMemoryInTest = process.env.NODE_ENV === 'test' && process.env.TEST_FILE_DB !== '1'
    const dbPath = useMemoryInTest
      ? ':memory:'
      : dbConfig.sqlite.path || './database/novel2manga.db'

    // Ensure the directory exists
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const initialize = (Driver: typeof import('better-sqlite3')) => {
      const sqliteDb = new Driver(dbPath)
      const drizzleDb = drizzle(sqliteDb, { schema })

      // Initialize the new database service architecture
      const connection = createDatabaseConnection({ sqlite: drizzleDb })
      initializeDatabaseServiceFactory(connection)

      // In dev/test, run migrations only when it's safe to do so。
      // 明示的にスキップ指定がある場合はマイグレーションを行わない
      if (shouldRunMigrations()) {
        // Detect if the DB already has application tables but lacks drizzle's meta table.
        // In that case, running migrations may fail with "table already exists"; skip with a clear warning.
        const hasDrizzleMeta = (() => {
          const row = sqliteDb
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
            )
            .get() as unknown
          const name = (row as null | Record<string, unknown>)?.name
          return typeof name === 'string'
        })()

        const hasUserTables = (() => {
          const rows = sqliteDb
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as unknown
          const list = Array.isArray(rows) ? rows : []
          return list.length > 0
        })()

        if (!hasDrizzleMeta && hasUserTables) {
          // DBは既にアプリのテーブルを持つが、マイグレーション管理テーブルが無い状態。
          // この場合は自動migrateをスキップし、明確なメッセージを出す。
          getLogger().warn('database_migrate_meta_missing', {
            dbPath,
            action:
              '開発用途: そのまま継続可能です。厳密整合が必要な場合はDBを初期化するか、手動でメタを整合させてください。',
            options: [
              '安全: database/novel2manga.db を一旦削除して起動時にクリーン作成（データ消去に注意）',
              '上級: drizzle/meta/_journal.json の内容に合わせて __drizzle_migrations を手動作成・同期',
            ],
          })
        } else {
          try {
            migrate(drizzleDb, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
          } catch (migrateError) {
            // フォールバック禁止方針: マイグレーション失敗は重大事として明示し、起動を停止する
            const message =
              migrateError instanceof Error ? migrateError.message : String(migrateError)
            getLogger().error('database_migrate_failed', {
              message,
              guidance: [
                '1) 開発用途: database/novel2manga.db を削除して再作成 (データ消去に注意)',
                '2) 既存DB維持: drizzle/meta/_journal.json と __drizzle_migrations の整合を取り、重複カラム/テーブルを手動修正',
                '3) 競合例: 既に存在するカラムに対する ALTER TABLE 追加 (drizzle/000x_*.sql) など',
              ],
            })
            throw migrateError
          }
        }
      }

      return drizzleDb
    }

    try {
      const Driver = loadBetterSqlite3()
      db = initialize(Driver)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (!isNativeModuleError(error) || rebuildAttempted) {
        if (isNativeModuleError(error)) {
          getLogger().error('database_init_native_module_failed_after_rebuild', {
            message: msg,
            hint: '自動再ビルド後も失敗しました。手動での対応が必要です。',
            steps: [
              'npm rebuild better-sqlite3',
              'rm -rf node_modules package-lock.json',
              'npm ci',
            ],
            nodeVersion: process.version,
            cwd: process.cwd(),
          })
        } else {
          getLogger().error('database_init_unexpected_error', { message: msg })
        }
        throw error
      }

      // First-time ABI mismatch detected; attempt automatic rebuild
      rebuildAttempted = true
      getLogger().info('database_init_abi_mismatch_rebuild', { message: msg })
      try {
        rebuildBetterSqlite3()
        const Driver = loadBetterSqlite3(true)
        db = initialize(Driver)
        getLogger().info('database_init_rebuild_success', {})
      } catch (rebuildError) {
        const innerMsg = rebuildError instanceof Error ? rebuildError.message : String(rebuildError)
        getLogger().error('database_init_rebuild_failed', { message: innerMsg })
        throw rebuildError
      }
    }
    // Migrations are handled above inside the initialization try-block with safety checks.
  }

  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export { schema }
export * from './schema'
