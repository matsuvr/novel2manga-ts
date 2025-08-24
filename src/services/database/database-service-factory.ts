import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { EpisodeDatabaseService } from './episode-database-service'
import { JobDatabaseService } from './job-database-service'
import { TransactionService } from './transaction-service'

type Database = BetterSQLite3Database<typeof schema>

/**
 * Factory for creating database services
 * Provides unified access to all domain-specific database services
 * Follows Factory and Dependency Injection patterns
 */
export class DatabaseServiceFactory {
  private readonly episodeService: EpisodeDatabaseService
  private readonly jobService: JobDatabaseService
  private readonly transactionService: TransactionService

  constructor(private readonly db: Database) {
    this.episodeService = new EpisodeDatabaseService(db)
    this.jobService = new JobDatabaseService(db)
    this.transactionService = new TransactionService(db)
  }

  /**
   * Get episode-specific database operations
   */
  episodes(): EpisodeDatabaseService {
    return this.episodeService
  }

  /**
   * Get job-specific database operations
   */
  jobs(): JobDatabaseService {
    return this.jobService
  }

  /**
   * Get transaction service for complex operations
   */
  transactions(): TransactionService {
    return this.transactionService
  }

  /**
   * Execute cross-domain operation in a single transaction
   * Use this for operations that span multiple domains
   */
  executeAcrossDomains<T>(
    operation: (services: {
      episodes: EpisodeDatabaseService
      jobs: JobDatabaseService
      tx: TransactionService
    }) => T,
  ): T {
    return this.transactionService.executeSync((_tx) => {
      // Create transaction-aware instances for cross-domain operations
      const episodes = new EpisodeDatabaseService(this.db)
      const jobs = new JobDatabaseService(this.db)

      return operation({
        episodes,
        jobs,
        tx: this.transactionService,
      })
    })
  }

  /**
   * Get raw database instance
   * Use only when absolutely necessary
   */
  getRawDatabase(): Database {
    return this.db
  }
}

/**
 * Global factory instance
 * This will be initialized with the application's database connection
 */
let globalFactory: DatabaseServiceFactory | null = null

/**
 * Initialize the global database service factory
 * If a factory already exists, it will be cleaned up first
 */
export function initializeDatabaseServiceFactory(db: Database): void {
  // Clean up existing factory if it exists
  if (globalFactory) {
    cleanup()
  }
  globalFactory = new DatabaseServiceFactory(db)
}

/**
 * Get the global database service factory
 */
export function getDatabaseServiceFactory(): DatabaseServiceFactory {
  if (!globalFactory) {
    throw new Error(
      'DatabaseServiceFactory not initialized. Call initializeDatabaseServiceFactory first.',
    )
  }
  return globalFactory
}

/**
 * Clean up the global database service factory
 * Should be called when the application is shutting down
 */
export function cleanup(): void {
  if (globalFactory) {
    // Close the database connection if it has a close method
    const db = globalFactory.getRawDatabase()
    if (db && typeof (db as unknown as { close?: () => void }).close === 'function') {
      ;(db as unknown as { close: () => void }).close()
    }
    globalFactory = null
  }
}

/**
 * Check if the factory is initialized
 */
export function isFactoryInitialized(): boolean {
  return globalFactory !== null
}

/**
 * Convenience functions for common operations
 */
export const db = {
  episodes: () => getDatabaseServiceFactory().episodes(),
  jobs: () => getDatabaseServiceFactory().jobs(),
  transactions: () => getDatabaseServiceFactory().transactions(),
  executeAcrossDomains: (
    operation: Parameters<DatabaseServiceFactory['executeAcrossDomains']>[0],
  ) => getDatabaseServiceFactory().executeAcrossDomains(operation),
}
