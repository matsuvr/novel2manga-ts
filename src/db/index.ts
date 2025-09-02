import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDatabaseConfig } from '@/config'
import { cleanup } from '@/services/database/database-service-factory'
// Import will be added when migration is complete to avoid circular dependency
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function shouldRunMigrations(env: NodeJS.ProcessEnv = process.env): boolean {
  const skipMigrate = env.DB_SKIP_MIGRATE === '1'
  if (skipMigrate) return false
  const nodeEnv = env.NODE_ENV
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test'
  const isVitest = Boolean(env.VITEST)
  return isDevOrTest || isVitest
}

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

    try {
      const sqliteDb = new Database(dbPath)
      db = drizzle(sqliteDb, { schema })

      // TODO: Initialize the new database service architecture when migration is complete
      // initializeDatabaseServiceFactory(db)

      // In dev/test, run migrations only when it's safe to do so.
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
          console.warn(
            '[Database:migrate] 既存テーブルを検出しましたが __drizzle_migrations が存在しません。マイグレーションをスキップします。',
            {
              dbPath,
              action:
                '開発用途: そのまま継続可能です。厳密整合が必要な場合はDBを初期化するか、手動でメタを整合させてください。',
              options: [
                '安全: database/novel2manga.db を一旦削除して起動時にクリーン作成（データ消去に注意）',
                '上級: drizzle/meta/_journal.json の内容に合わせて __drizzle_migrations を手動作成・同期',
              ],
            },
          )
        } else {
          try {
            migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
          } catch (migrateError) {
            // フォールバック禁止方針: マイグレーション失敗は重大事として明示し、起動を停止する
            const message =
              migrateError instanceof Error ? migrateError.message : String(migrateError)
            console.error(
              '[Database:migrate] マイグレーションに失敗しました。アプリ起動を停止します。',
              {
                message,
                guidance: [
                  '1) 開発用途: database/novel2manga.db を削除して再作成 (データ消去に注意)',
                  '2) 既存DB維持: drizzle/meta/_journal.json と __drizzle_migrations の整合を取り、重複カラム/テーブルを手動修正',
                  '3) 競合例: 既に存在するカラムに対する ALTER TABLE 追加 (drizzle/000x_*.sql) など',
                ],
              },
            )
            throw migrateError
          }
        }
      }
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
    // Migrations are handled above inside the initialization try-block with safety checks.
  }

  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export { schema }
export * from './schema'
