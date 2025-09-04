import type { D1Database } from '@cloudflare/workers-types'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getDatabase } from '@/db'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from './adapters/base-adapter'
import { D1Adapter, isD1Like } from './adapters/d1-adapter'
import { SqliteAdapter } from './adapters/sqlite-adapter'

export type DrizzleSqlite = BetterSQLite3Database<typeof schema>

export type DatabaseConnection<TDb = unknown> = {
  db: TDb
  adapter: DatabaseAdapter
}

export function detectAdapter(dbOrBinding: unknown): DatabaseAdapter {
  if (isD1Like(dbOrBinding)) {
    return new D1Adapter(dbOrBinding as D1Database)
  }
  // Assume Drizzle better-sqlite3 instance; caller is responsible for passing correct type.
  return new SqliteAdapter(dbOrBinding as DrizzleSqlite)
}

/**
 * Create application database connection and adapter.
 * - By default, uses local better-sqlite3 via Drizzle.
 * - Optionally accepts a D1 binding for Workers environments.
 */
export function createDatabaseConnection(options?: {
  d1?: D1Database
  sqlite?: DrizzleSqlite
}): DatabaseConnection<DrizzleSqlite> | DatabaseConnection<D1Database> {
  if (options?.d1) {
    const adapter = new D1Adapter(options.d1)
    return { db: options.d1, adapter }
  }

  const db = options?.sqlite ?? (getDatabase() as DrizzleSqlite)
  const adapter = new SqliteAdapter(db)
  return { db, adapter }
}
