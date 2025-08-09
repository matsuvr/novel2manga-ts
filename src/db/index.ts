import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDatabaseConfig } from '@/config'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDatabase() {
  if (!db) {
    const dbConfig = getDatabaseConfig()
    const dbPath = dbConfig.sqlite.path || './database/novel2manga.db'

    // Ensure the directory exists
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const sqliteDb = new Database(dbPath)
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
