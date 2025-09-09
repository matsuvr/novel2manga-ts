import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from './adapters/base-adapter'
import { SqliteAdapter } from './adapters/sqlite-adapter'

export type DrizzleSqlite = BetterSQLite3Database<typeof schema>

export type DatabaseConnection<TDb = unknown> = {
  db: TDb
  adapter: DatabaseAdapter
}

/**
 * Create application database connection and adapter.
 * Only sqlite (better-sqlite3 via Drizzle) is supported in this build.
 */
export function createDatabaseConnection(options?: { sqlite?: DrizzleSqlite }): DatabaseConnection<DrizzleSqlite> {
  if (!options?.sqlite) {
    throw new Error('createDatabaseConnection requires a sqlite database instance in this environment')
  }
  const db = options.sqlite
  const adapter = new SqliteAdapter(db)
  return { db, adapter }
}
