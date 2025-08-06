import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getConfig } from '@/config'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDatabase() {
  if (!db) {
    const config = getConfig()
    const dbConfig = config.get('database') as { path: string }

    const sqliteDb = new Database(dbConfig.path)
    db = drizzle(sqliteDb, { schema })

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

  return db
}

export { schema }
export * from './schema'
