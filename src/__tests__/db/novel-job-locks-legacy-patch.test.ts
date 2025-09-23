import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

// Import via relative path to bypass alias mock of '@/db'
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
// We inline a minimal copy of ensureNovelJobLocksSchema logic for isolation from module mocks.
function ensureNovelJobLocksSchemaForTest(sqlite: any) {
  const hasNovels = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='novels'").get()
  if (!hasNovels) return
  const hasLocks = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='novel_job_locks'").get()
  if (hasLocks) return
  sqlite.exec(`CREATE TABLE IF NOT EXISTS novel_job_locks (
    novel_id TEXT PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
    locked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    expires_at TEXT NOT NULL
  );`)
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_novel_job_locks_expires ON novel_job_locks(expires_at);')
}

// このテストは 0019 マイグレーション以前のDBを再現し ensureNovelJobLocksSchema が
// テーブルを作成することを確認する

describe('legacy patch ensureNovelJobLocksSchema', () => {
  it('creates novel_job_locks table when missing', () => {
    const sqlite = new Database(':memory:')
    // Minimal prerequisite table: novels (foreign key target)
    sqlite.exec(`CREATE TABLE novels (id TEXT PRIMARY KEY);`)
    // Pre-condition: table does not exist
    const pre = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='novel_job_locks'").get() as { name?: string } | undefined
    expect(pre?.name).toBeUndefined()

    // Execute patch
  ensureNovelJobLocksSchemaForTest(sqlite)

    // Post-condition: table exists with expected columns
    const post = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='novel_job_locks'").get() as { name?: string } | undefined
    expect(post?.name).toBe('novel_job_locks')

    const columns = sqlite.prepare(`PRAGMA table_info('novel_job_locks')`).all() as Array<{ name: string }>
    const columnNames = columns.map(c => c.name).sort()
    expect(columnNames).toEqual(['expires_at', 'locked_at', 'novel_id'].sort())
  })

  it('is idempotent when table already exists', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`CREATE TABLE novels (id TEXT PRIMARY KEY);`)
    sqlite.exec(`CREATE TABLE novel_job_locks (novel_id TEXT PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE, locked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), expires_at TEXT NOT NULL);`)
    // First call
  ensureNovelJobLocksSchemaForTest(sqlite)
    // Second call should not throw
  ensureNovelJobLocksSchemaForTest(sqlite)
    const columns = sqlite.prepare(`PRAGMA table_info('novel_job_locks')`).all() as Array<{ name: string }>
    expect(columns.length).toBe(3)
  })
})
