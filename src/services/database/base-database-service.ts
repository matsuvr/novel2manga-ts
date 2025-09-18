import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'
import { getLogger } from '@/infrastructure/logging/logger'
import { type Database, type TransactionOperation, TransactionService } from './transaction-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Base class for all database services
 * Provides unified transaction handling and common utilities
 */
export abstract class BaseDatabaseService {
  protected readonly transaction: TransactionService

  constructor(
    protected readonly db: Database,
    protected readonly adapter: DatabaseAdapter,
  ) {
    this.transaction = new TransactionService(db, adapter)
  }

  /**
   * Execute operation in a transaction
   * This is the recommended way to perform database operations
   * Works with both sync and async adapters
   */
  protected async executeInTransaction<T>(operation: TransactionOperation<T>): Promise<T> {
    const logger = getLogger()
    logger.debug('base_executeInTransaction_enter')
    const result = await this.transaction.execute(operation)
    logger.debug('base_executeInTransaction_exit')
    return result
  }

  /**
   * Execute synchronous operation in a transaction (SQLite only)
   * @deprecated Use executeInTransaction for cross-platform compatibility
   */
  protected executeInTransactionSync<T>(
    operation: (tx: Parameters<Parameters<DrizzleDatabase['transaction']>[0]>[0]) => T,
  ): T {
    if (!this.adapter.isSync()) {
      throw new Error('Synchronous transactions are not supported in this environment')
    }
    return this.transaction.executeSync(operation)
  }

  /**
   * Execute multiple operations as a unit of work
   */
  protected async executeUnitOfWork<T>(operation: () => Promise<T>): Promise<T> {
    return await this.transaction.executeWithUnitOfWork(operation)
  }

  /**
   * Check if the current environment supports synchronous operations
   */
  protected isSync(): boolean {
    return this.adapter.isSync()
  }

  /**
   * Get current database instance
   * Use sparingly - prefer transaction-wrapped operations
   */
  protected getDatabase(): Database {
    return this.db
  }

  /**
   * Get the database adapter
   */
  protected getAdapter(): DatabaseAdapter {
    return this.adapter
  }
}
