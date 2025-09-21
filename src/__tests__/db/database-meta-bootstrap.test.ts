import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const originalDbSkipMigrate = process.env.DB_SKIP_MIGRATE
const originalTestFileDb = process.env.TEST_FILE_DB

let tempDir: string

async function closeDrizzleInstance(instance: unknown): Promise<void> {
  const { cleanup } = await import('@/services/database/database-service-factory')
  cleanup()

  const raw = instance as { readonly session?: { readonly client?: { readonly close?: () => void } } }
  const client = raw.session?.client
  if (client && typeof client.close === 'function') {
    try {
      client.close()
    } catch {
      // ignore close errors in tests
    }
  }
}

describe('database metadata bootstrap', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n2m-meta-'))
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalDbSkipMigrate === undefined) {
      delete process.env.DB_SKIP_MIGRATE
    } else {
      process.env.DB_SKIP_MIGRATE = originalDbSkipMigrate
    }

    if (originalTestFileDb === undefined) {
      delete process.env.TEST_FILE_DB
    } else {
      process.env.TEST_FILE_DB = originalTestFileDb
    }

    fs.rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('reconstructs missing drizzle metadata and applies pending migrations', async () => {
    const Database = (await import('better-sqlite3')).default
    const dbPath = path.join(tempDir, 'legacy.db')

    const legacyDb = new Database(dbPath)
    legacyDb.exec(
      `CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT,
        author TEXT,
        original_text_path TEXT,
        text_length INTEGER NOT NULL DEFAULT 0,
        language TEXT DEFAULT 'ja',
        metadata_path TEXT,
        user_id TEXT DEFAULT 'anonymous',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );`,
    )
    legacyDb.exec(
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_name TEXT,
        user_id TEXT NOT NULL DEFAULT 'anonymous',
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT NOT NULL DEFAULT 'initialized',
        split_completed INTEGER DEFAULT 0,
        analyze_completed INTEGER DEFAULT 0,
        episode_completed INTEGER DEFAULT 0,
        layout_completed INTEGER DEFAULT 0,
        render_completed INTEGER DEFAULT 0,
        chunks_dir_path TEXT,
        analyses_dir_path TEXT,
        episodes_data_path TEXT,
        layouts_dir_path TEXT,
        renders_dir_path TEXT,
        character_memory_path TEXT,
        prompt_memory_path TEXT,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        total_episodes INTEGER DEFAULT 0,
        processed_episodes INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        rendered_pages INTEGER DEFAULT 0,
        processing_episode INTEGER,
        processing_page INTEGER,
        last_error TEXT,
        last_error_step TEXT,
        retry_count INTEGER DEFAULT 0,
        resume_data_path TEXT,
        coverage_warnings TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT
      );`,
    )
    legacyDb.close()

    process.env.NODE_ENV = 'development'
    delete process.env.DB_SKIP_MIGRATE
    delete process.env.TEST_FILE_DB

    vi.resetModules()

    vi.doMock('@/config', async () => {
      const actual = await vi.importActual<typeof import('@/config')>('@/config')
      return {
        ...actual,
        getDatabaseConfig: () => ({
          type: 'sqlite' as const,
          sqlite: { path: dbPath, timeout: 5000, maxConnections: 1 },
          migrations: { enabled: true, migrationsPath: './database/migrations' },
        }),
      }
    })

    const dbModule = await vi.importActual<typeof import('@/db')>('@/db')
    const { getDatabase, __databaseInternals } = dbModule
    __databaseInternals.resetDatabaseCache()
    const database = getDatabase()

    const inspector = new Database(dbPath)
    const jobColumns = inspector
      .prepare("PRAGMA table_info('jobs')")
      .all() as Array<{ readonly name: string }>
    const columnNames = jobColumns.map((column) => column.name)

    expect(columnNames).toContain('locked_by')
    expect(columnNames).toContain('lease_expires_at')
    expect(columnNames).toContain('last_notified_status')
    expect(columnNames).toContain('last_notified_at')

    const metaRow = inspector
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
      .get() as { readonly name?: string } | undefined
    expect(metaRow?.name).toBe('__drizzle_migrations')

    const migrations = inspector
      .prepare('SELECT hash FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1')
      .get() as { readonly hash?: string } | undefined
    expect(typeof migrations?.hash).toBe('string')

    inspector.close()

    await closeDrizzleInstance(database)
  })

  test('repairs missing leasing columns when migration metadata already exists', async () => {
    const Database = (await import('better-sqlite3')).default
    const dbPath = path.join(tempDir, 'drift.db')

    const driftedDb = new Database(dbPath)
    driftedDb.exec(
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_name TEXT,
        user_id TEXT NOT NULL DEFAULT 'anonymous',
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT NOT NULL DEFAULT 'initialized',
        split_completed INTEGER DEFAULT 0,
        analyze_completed INTEGER DEFAULT 0,
        episode_completed INTEGER DEFAULT 0,
        layout_completed INTEGER DEFAULT 0,
        render_completed INTEGER DEFAULT 0,
        chunks_dir_path TEXT,
        analyses_dir_path TEXT,
        episodes_data_path TEXT,
        layouts_dir_path TEXT,
        renders_dir_path TEXT,
        character_memory_path TEXT,
        prompt_memory_path TEXT,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        total_episodes INTEGER DEFAULT 0,
        processed_episodes INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        rendered_pages INTEGER DEFAULT 0,
        processing_episode INTEGER,
        processing_page INTEGER,
        last_error TEXT,
        last_error_step TEXT,
        retry_count INTEGER DEFAULT 0,
        resume_data_path TEXT,
        coverage_warnings TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT
      );`,
    )
    driftedDb.exec(
      `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        "id" integer PRIMARY KEY AUTOINCREMENT,
        "hash" text NOT NULL,
        "created_at" numeric NOT NULL
      );`,
    )
    const journalPath = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json')
    const journalRaw = fs.readFileSync(journalPath, 'utf8')
    const parsed = JSON.parse(journalRaw) as {
      readonly entries?: ReadonlyArray<{ readonly tag?: unknown; readonly when?: unknown }>
    }
    const insertMigration = driftedDb.prepare(
      'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
    )
    const now = Date.now()
    for (const entry of Array.isArray(parsed.entries) ? parsed.entries : []) {
      if (entry && typeof entry.tag === 'string' && entry.tag.length > 0) {
        const createdAt = typeof entry.when === 'number' && Number.isFinite(entry.when) ? entry.when : now
        insertMigration.run(entry.tag, createdAt)
      }
    }
    driftedDb.close()

    process.env.NODE_ENV = 'development'
    delete process.env.DB_SKIP_MIGRATE
    delete process.env.TEST_FILE_DB

    vi.resetModules()

    vi.doMock('@/config', async () => {
      const actual = await vi.importActual<typeof import('@/config')>('@/config')
      return {
        ...actual,
        getDatabaseConfig: () => ({
          type: 'sqlite' as const,
          sqlite: { path: dbPath, timeout: 5000, maxConnections: 1 },
          migrations: { enabled: true, migrationsPath: './database/migrations' },
        }),
      }
    })

    const dbModule = await vi.importActual<typeof import('@/db')>('@/db')
    const { getDatabase, __databaseInternals } = dbModule
    __databaseInternals.resetDatabaseCache()
    const database = getDatabase()

    const inspector = new Database(dbPath)
    const jobColumns = inspector
      .prepare("PRAGMA table_info('jobs')")
      .all() as Array<{ readonly name: string }>
    const columnNames = jobColumns.map((column) => column.name)

    expect(columnNames).toContain('locked_by')
    expect(columnNames).toContain('lease_expires_at')
    expect(columnNames).toContain('last_notified_status')
    expect(columnNames).toContain('last_notified_at')

    const notificationsTable = inspector
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='job_notifications'")
      .get() as { readonly name?: string } | undefined
    expect(notificationsTable?.name).toBe('job_notifications')

    inspector.close()

    await closeDrizzleInstance(database)
  })
})
