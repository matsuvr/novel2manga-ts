import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { DatabaseAdapter } from './base-adapter'

type DrizzleSqlite = BetterSQLite3Database<typeof schema>

/**
 * SqliteAdapter wraps a Drizzle better-sqlite3 database.
 * - Provides true synchronous transaction semantics.
 */
export class SqliteAdapter extends DatabaseAdapter {
  constructor(private readonly db: DrizzleSqlite) {
    super()
  }

  async transaction<TTx, T>(fn: (tx: TTx) => T | Promise<T>): Promise<T> {
    const result = this.db.transaction((tx) => {
      // If fn returns a Promise, we cannot await in sync tx.
      const out = fn(tx as unknown as TTx)
      if (out instanceof Promise) {
        // Explicitly fail to avoid hidden fallback/partial commits.
        throw new Error(
          'Async work inside a synchronous (better-sqlite3) transaction is not supported. ' +
            'Ensure all DB operations within this transaction are synchronous, or use the async transaction path instead.',
        )
      }
      return out
    })
    return Promise.resolve(result)
  }

  runSync<T>(fn: () => T): T {
    return fn()
  }

  isSync(): boolean {
    return true
  }
}
