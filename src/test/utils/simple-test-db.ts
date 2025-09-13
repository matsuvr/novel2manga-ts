import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../db/schema'

export type TestDbHandle = {
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
}

export function createTestDb(migrationsFolder = `${process.cwd()}/drizzle`): TestDbHandle {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return { sqlite, db }
}

export function cleanupTestDb(handle: TestDbHandle): void {
  try {
    handle.sqlite.close()
  } catch {
    /* ignore */
  }
}
