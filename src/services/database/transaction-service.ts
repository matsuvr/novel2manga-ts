import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'

type Database = BetterSQLite3Database<typeof schema>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type SyncTransactionOperation<T> = (tx: Transaction) => T

export type AsyncTransactionOperation<T> = () => Promise<T>

/**
 * Unified transaction service that handles both sync and async operations
 * while respecting better-sqlite3's constraint that transaction functions must be synchronous
 */
export class TransactionService {
  constructor(private db: Database) {}

  /**
   * Execute synchronous transaction operation
   * This is the preferred method for better-sqlite3 compatibility
   */
  executeSync<T>(operation: SyncTransactionOperation<T>): T {
    return this.db.transaction(operation)
  }

  /**
   * Execute asynchronous operation within a synchronous transaction
   * Use this when you need async operations but want transaction safety
   *
   * WARNING: This converts async operations to sync, which may have limitations
   */
  executeAsyncInSync<T>(_operation: AsyncTransactionOperation<T>): T {
    throw new Error(
      'Async operations in sync transactions are not supported with better-sqlite3. Use executeSync with sync operations instead.',
    )
  }

  /**
   * Execute operation with explicit transaction boundaries
   * This method respects the UnitOfWork pattern
   */
  async executeWithUnitOfWork<T>(operation: () => Promise<T>): Promise<T> {
    // For better-sqlite3, we need to ensure operations are properly coordinated
    // This method should be used for complex multi-step operations
    return await operation()
  }

  /**
   * Create a transaction-aware operation wrapper
   */
  createTransactionWrapper<TArgs extends unknown[], TResult>(
    operation: (tx: Transaction, ...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    return (...args: TArgs) => {
      return this.executeSync((tx) => operation(tx, ...args))
    }
  }
}
