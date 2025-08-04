import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { getConfig } from '@/config'
import * as schema from './schema'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDatabase() {
  if (!db) {
    const config = getConfig()
    const dbConfig = config.get('database') as { path: string }

    const sqliteDb = new Database(dbConfig.path)
    db = drizzle(sqliteDb, { schema })
  }

  return db
}

export { schema }
export * from './schema'
