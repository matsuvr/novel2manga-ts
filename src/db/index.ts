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

type BetterSqlite3Module = typeof import('better-sqlite3')
type BetterSqlite3Database = InstanceType<BetterSqlite3Module>

interface DrizzleJournalEntry {
  readonly tag: string
  readonly when?: number
}

interface DrizzleJournal {
  readonly entries?: ReadonlyArray<DrizzleJournalEntry>
}

const JOB_LEASING_AND_NOTIFICATIONS_MIGRATION = '0018_job_leasing_and_notifications' as const

function doesTableExist(sqliteDb: BetterSqlite3Database, tableName: string): boolean {
  const row = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { readonly name?: unknown } | undefined
  return typeof row?.name === 'string'
}

function ensureJobLeasingSchema(sqliteDb: BetterSqlite3Database): void {
  const logger = getLogger().withContext({ scope: 'drizzle-bootstrap' })
  if (!doesTableExist(sqliteDb, 'jobs')) {
    logger.debug('database_job_table_missing_for_legacy_patch', { table: 'jobs' })
    return
  }
  const columnRows = sqliteDb
    .prepare("PRAGMA table_info('jobs')")
    .all() as ReadonlyArray<{ readonly name?: unknown }>
  const existingColumns = new Set(
    columnRows
      .map((row) => (row && typeof row.name === 'string' ? row.name : ''))
      .filter((name) => name.length > 0),
  )

  const columnStatements: ReadonlyArray<{ readonly name: string; readonly sql: string }> = [
    { name: 'locked_by', sql: 'ALTER TABLE jobs ADD COLUMN locked_by TEXT' },
    { name: 'lease_expires_at', sql: 'ALTER TABLE jobs ADD COLUMN lease_expires_at TEXT' },
    { name: 'last_notified_status', sql: 'ALTER TABLE jobs ADD COLUMN last_notified_status TEXT' },
    { name: 'last_notified_at', sql: 'ALTER TABLE jobs ADD COLUMN last_notified_at TEXT' },
  ]

  let appliedColumns = 0
  for (const statement of columnStatements) {
    if (!existingColumns.has(statement.name)) {
      sqliteDb.exec(statement.sql)
      appliedColumns += 1
    }
  }

  const notificationsTable = sqliteDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='job_notifications'",
    )
    .get() as { readonly name?: unknown } | undefined

  let createdNotificationsTable = false
  if (!notificationsTable || typeof notificationsTable.name !== 'string') {
    sqliteDb.exec(
      `CREATE TABLE IF NOT EXISTS job_notifications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_job_notifications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );`,
    )
    sqliteDb.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS unique_job_notification ON job_notifications (job_id, status);',
    )
    sqliteDb.exec(
      'CREATE INDEX IF NOT EXISTS idx_job_notifications_job_id ON job_notifications (job_id);',
    )
    createdNotificationsTable = true
  }

  if (appliedColumns > 0 || createdNotificationsTable) {
    logger.info('database_legacy_schema_patched', {
      appliedColumns,
      createdNotificationsTable,
    })
  }
}

function bootstrapDrizzleMigrationsMetadata(
  sqliteDb: BetterSqlite3Database,
  migrationsDir: string,
): void {
  const logger = getLogger().withContext({ scope: 'drizzle-bootstrap' })
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json')

  if (!fs.existsSync(journalPath)) {
    throw new Error(`Drizzle journal not found at ${journalPath}`)
  }

  const rawJournal = fs.readFileSync(journalPath, 'utf8')
  let parsed: DrizzleJournal

  try {
    parsed = JSON.parse(rawJournal) as DrizzleJournal
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse Drizzle journal: ${message}`)
  }

  const normalizedEntries = (Array.isArray(parsed.entries) ? parsed.entries : [])
    .filter((entry): entry is DrizzleJournalEntry => Boolean(entry && typeof entry.tag === 'string'))
    .map((entry) => ({
      hash: entry.tag,
      createdAt:
        typeof entry.when === 'number' && Number.isFinite(entry.when)
          ? entry.when
          : Date.now(),
    }))
    .sort((a, b) => a.createdAt - b.createdAt)

  if (normalizedEntries.length === 0) {
    throw new Error('Drizzle journal does not contain migration entries to seed metadata table')
  }

  const migrationValidators: Record<string, (db: BetterSqlite3Database) => boolean> = {
    [JOB_LEASING_AND_NOTIFICATIONS_MIGRATION]: (database) => {
      const rows = database
        .prepare("PRAGMA table_info('jobs')")
        .all() as ReadonlyArray<{ readonly name?: unknown }>
      const names = rows
        .map((row) => (row && typeof row.name === 'string' ? row.name : ''))
        .filter((name) => name.length > 0)
      return (
        names.includes('locked_by') &&
        names.includes('lease_expires_at') &&
        names.includes('last_notified_status') &&
        names.includes('last_notified_at')
      )
    },
  }

  const entriesToInsert: typeof normalizedEntries = []
  let pendingStartIndex: number | null = null

  for (let index = 0; index < normalizedEntries.length; index += 1) {
    const entry = normalizedEntries[index]
    const validator = migrationValidators[entry.hash]

    if (validator && !validator(sqliteDb)) {
      pendingStartIndex = index
      logger.warn('database_migrate_meta_validator_pending', {
        migration: entry.hash,
        reason: 'validator returned false',
      })
      break
    }

    entriesToInsert.push(entry)
  }

  if (entriesToInsert.length === 0) {
    throw new Error('Unable to infer applied migrations from journal entries; aborting metadata bootstrap')
  }

  sqliteDb.exec(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      "id" integer PRIMARY KEY AUTOINCREMENT,
      "hash" text NOT NULL,
      "created_at" numeric NOT NULL
    );`,
  )

  const existingRows = sqliteDb
    .prepare('SELECT hash FROM "__drizzle_migrations"')
    .all() as ReadonlyArray<{ readonly hash?: unknown }>

  const existingHashes = new Set<string>()
  for (const row of existingRows) {
    if (row && typeof row.hash === 'string' && row.hash.length > 0) {
      existingHashes.add(row.hash)
    }
  }

  const insertStatement = sqliteDb.prepare(
    'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
  )

  let inserted = 0

  const runInsert = sqliteDb.transaction((entries: ReadonlyArray<{ hash: string; createdAt: number }>) => {
    for (const entry of entries) {
      if (!existingHashes.has(entry.hash)) {
        insertStatement.run(entry.hash, entry.createdAt)
        existingHashes.add(entry.hash)
        inserted += 1
      }
    }
  })

  runInsert(entriesToInsert)

  logger.info('database_migrate_meta_bootstrap_completed', {
    inserted,
    totalEntries: entriesToInsert.length,
    journalPath,
    pendingMigrations:
      pendingStartIndex === null ? 0 : normalizedEntries.length - pendingStartIndex,
  })
}

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
      const migrationsFolder = path.join(process.cwd(), 'drizzle')

  const hasDrizzleMeta = doesTableExist(sqliteDb, '__drizzle_migrations')
  const hasJobsTable = doesTableExist(sqliteDb, 'jobs')
  const leasingMigrationRecorded = hasDrizzleMeta
    ? (() => {
        const row = sqliteDb
          .prepare('SELECT hash FROM "__drizzle_migrations" WHERE hash = ? LIMIT 1')
          .get(JOB_LEASING_AND_NOTIFICATIONS_MIGRATION) as { readonly hash?: unknown } | undefined
        return typeof row?.hash === 'string'
      })()
    : false

  const hasUserTables = (() => {
    const rows = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as unknown
        const list = Array.isArray(rows) ? rows : []
        return list.length > 0
      })()

  if (hasJobsTable && (leasingMigrationRecorded || !hasDrizzleMeta)) {
    ensureJobLeasingSchema(sqliteDb)
  }

  if (!hasDrizzleMeta && hasUserTables) {
    try {
      bootstrapDrizzleMigrationsMetadata(sqliteDb, migrationsFolder)
    } catch (bootstrapError) {
          const message = bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError)
          getLogger().error('database_migrate_meta_bootstrap_failed', {
            message,
            dbPath,
            guidance: [
              'database/novel2manga.db を退避した上で npm run db:migrate を実行すると再生成されます。',
              'あるいは drizzle/meta/_journal.json を参照して __drizzle_migrations を手動整備してください。',
            ],
          })
          throw bootstrapError
        }
      }

      const shouldMigrate = shouldRunMigrations()
      if (shouldMigrate) {
        try {
          migrate(drizzleDb, { migrationsFolder })
        } catch (migrateError) {
          // フォールバック禁止方針: マイグレーション失敗は重大事として明示し、起動を停止する
          const message = migrateError instanceof Error ? migrateError.message : String(migrateError)
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

export const __databaseInternals = {
  ensureJobLeasingSchema,
  bootstrapDrizzleMigrationsMetadata,
  resetDatabaseCache: () => {
    db = null
  },
}

export { schema }
export * from './schema'

/**
 * Test helper: create an isolated in-memory BetterSQLite3 + Drizzle instance.
 * Use this from tests to avoid importing `better-sqlite3` directly in test files
 * and to ensure tests can create a fresh DB instance with provided DDL.
 */
export function createInMemoryDrizzleWithSql(initialSql?: string) {
  const Driver = loadBetterSqlite3()
  const sqliteRaw = new Driver(':memory:')
  try {
    // Enable foreign keys by default like tests expect
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    sqliteRaw.pragma('foreign_keys = ON')
    if (initialSql && typeof initialSql === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      sqliteRaw.exec(initialSql)
    }
  } catch (error) {
    // ignore any setup errors; caller tests will surface failures
    try {
      const message = error instanceof Error ? error.message : String(error)
      getLogger().warn('createInMemoryDrizzleWithSql: setup failed', { message })
    } catch {
      // swallow logging errors to avoid masking original error
    }
  }
  const drizzleDb = drizzle(sqliteRaw, { schema })
  return { sqlite: sqliteRaw as unknown as ReturnType<typeof Driver>, drizzle: drizzleDb }
}
