import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { TransactionService } from './transaction-service'

type Database = BetterSQLite3Database<typeof schema>

/**
 * Base class for all database services
 * Provides unified transaction handling and common utilities
 */
export abstract class BaseDatabaseService {
  protected readonly transaction: TransactionService

  constructor(protected readonly db: Database) {
    this.transaction = new TransactionService(db)
  }

  /**
   * Execute operation in a transaction
   * This is the recommended way to perform database operations
   */
  protected executeInTransaction<T>(
    operation: (tx: Parameters<Parameters<TransactionService['executeSync']>[0]>[0]) => T,
  ): T {
    return this.transaction.executeSync(operation)
  }

  /**
   * Execute multiple operations as a unit of work
   */
  protected async executeUnitOfWork<T>(operation: () => Promise<T>): Promise<T> {
    return await this.transaction.executeWithUnitOfWork(operation)
  }

  /**
   * Get current database instance
   * Use sparingly - prefer transaction-wrapped operations
   */
  protected getDatabase(): Database {
    return this.db
  }
}
