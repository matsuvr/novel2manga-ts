import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'
import { getLogger } from '@/infrastructure/logging/logger'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>
type Transaction = Parameters<Parameters<DrizzleDatabase['transaction']>[0]>[0]

// Generic database type that can be either Drizzle or D1
export type Database = DrizzleDatabase | unknown

// Transaction operation that works with the actual database context
export type TransactionOperation<T> = (tx: unknown) => T | Promise<T>

// Legacy type aliases for backward compatibility
export type SyncTransactionOperation<T> = (tx: Transaction) => T
export type AsyncTransactionOperation<T> = () => Promise<T>

/**
 * Unified transaction service that handles both sync and async operations
 * Abstracts away the differences between better-sqlite3 and D1 using DatabaseAdapter
 */
export class TransactionService {
  constructor(
    private readonly db: Database,
    private readonly adapter: DatabaseAdapter,
  ) {}

  /**
   * Execute a transaction operation using the appropriate adapter
   * This method handles both sync (better-sqlite3) and async (D1) operations
   */
  async execute<T>(operation: TransactionOperation<T>): Promise<T> {
    const logger = getLogger()
    logger.debug('transaction_execute_enter', { isSync: this.adapter.isSync() })
    const result = await this.adapter.transaction((tx: unknown) => operation(tx))
    logger.debug('transaction_execute_exit')
    return result
  }

  /**
   * Execute synchronous transaction operation
   * @deprecated Use execute() instead for better cross-platform compatibility
   * @throws Error if the adapter doesn't support sync operations
   */
  executeSync<T>(operation: SyncTransactionOperation<T>): T {
    if (!this.adapter.isSync()) {
      throw new Error(
        'Synchronous transactions are not supported in this environment. Use execute() instead.',
      )
    }

    // For SQLite, we can directly use the Drizzle transaction
    const logger = getLogger()
    logger.debug('transaction_executeSync_enter')
    const drizzleDb = this.db as DrizzleDatabase
    const result = drizzleDb.transaction(operation)
    logger.debug('transaction_executeSync_exit')
    return result
  }

  /**
   * Execute operation with explicit transaction boundaries
   * This method respects the UnitOfWork pattern
   */
  async executeWithUnitOfWork<T>(operation: () => Promise<T>): Promise<T> {
    const logger = getLogger()
    logger.debug('transaction_executeWithUnitOfWork_enter')
    const result = await this.adapter.transaction((_tx: unknown) => operation())
    logger.debug('transaction_executeWithUnitOfWork_exit')
    return result
  }

  /**
   * Check if the current adapter supports synchronous operations
   */
  isSync(): boolean {
    return this.adapter.isSync()
  }

  /**
   * Create a transaction-aware operation wrapper
   * @deprecated This only works with sync adapters. Use execute() with closures instead.
   */
  createTransactionWrapper<TArgs extends unknown[], TResult>(
    operation: (tx: Transaction, ...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult {
    if (!this.adapter.isSync()) {
      throw new Error('Transaction wrappers are only supported with synchronous adapters')
    }

    return (...args: TArgs) => {
      return this.executeSync((tx) => operation(tx, ...args))
    }
  }

  /**
   * Get the underlying database adapter
   * Useful for checking capabilities
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter
  }
}
