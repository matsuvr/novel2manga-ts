import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import * as dbSchemaModule from '@/db/schema'
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
export function createDatabaseConnection(options?: {
  sqlite?: DrizzleSqlite | Database.Database
}): DatabaseConnection<DrizzleSqlite> {
  if (!options?.sqlite) {
    throw new Error(
      'createDatabaseConnection requires a sqlite database instance in this environment',
    )
  }

  const candidate = options.sqlite as unknown

  // If it's already a drizzle instance, prefer it
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as Record<string, unknown>).transaction === 'function'
  ) {
    const db = candidate as DrizzleSqlite
    // Ensure schema exists at runtime
    if (!('schema' in (db as unknown as Record<string, unknown>))) {
      try {
        // Attach the module schema only if the drizzle instance doesn't
        // already provide a wrapped schema. Prefer leaving the instance
        // intact to preserve internal symbols required by Drizzle.
        const resolved = (dbSchemaModule as unknown as { schema?: unknown })?.schema
          ? (dbSchemaModule as unknown as { schema?: unknown }).schema
          : dbSchemaModule
        Object.defineProperty(db as unknown as Record<string, unknown>, 'schema', {
          value: resolved,
          enumerable: false,
          configurable: true,
          writable: false,
        })
      } catch {
        // ignore
      }
    }
    const adapter = new SqliteAdapter(db)
    return { db, adapter }
  }

  // If it's a raw better-sqlite3 Database, wrap it with drizzle and attach schema
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as Record<string, unknown>).prepare === 'function'
  ) {
    const sqliteRaw = candidate as Database.Database
    const resolved = (dbSchemaModule as unknown as { schema?: unknown })?.schema
      ? (dbSchemaModule as unknown as { schema?: unknown }).schema
      : dbSchemaModule
    const drizzleDb = drizzle(sqliteRaw, { schema: resolved as unknown as typeof schema })
    // Keep drizzle-wrapped instance as-is. Do not overwrite its schema property.
    const db = drizzleDb as DrizzleSqlite
    const adapter = new SqliteAdapter(db)
    return { db, adapter }
  }

  throw new Error('createDatabaseConnection received unsupported sqlite value')
}
