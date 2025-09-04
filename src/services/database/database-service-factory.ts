import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'
import type { DatabaseConnection } from '@/infrastructure/database/connection'
import { ChunkDatabaseService } from './chunk-database-service'
import { EpisodeDatabaseService } from './episode-database-service'
import { JobDatabaseService } from './job-database-service'
import { LayoutDatabaseService } from './layout-database-service'
import { NovelDatabaseService } from './novel-database-service'
import { OutputDatabaseService } from './output-database-service'
import { RenderDatabaseService } from './render-database-service'
import { type Database, TransactionService } from './transaction-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Factory for creating database services
 * Provides unified access to all domain-specific database services
 * Follows Factory and Dependency Injection patterns
 */
export class DatabaseServiceFactory {
  private readonly episodeService: EpisodeDatabaseService
  private readonly jobService: JobDatabaseService
  private readonly novelService: NovelDatabaseService
  private readonly chunkService: ChunkDatabaseService
  private readonly outputService: OutputDatabaseService
  private readonly renderService: RenderDatabaseService
  private readonly layoutService: LayoutDatabaseService
  private readonly transactionService: TransactionService
  private readonly db: Database
  private readonly adapter: DatabaseAdapter

  constructor(connection: DatabaseConnection<Database>) {
    this.db = connection.db
    this.adapter = connection.adapter

    // Initialize all services with database and adapter
    this.episodeService = new EpisodeDatabaseService(this.db, this.adapter)
    this.jobService = new JobDatabaseService(this.db, this.adapter)
    this.novelService = new NovelDatabaseService(this.db, this.adapter)
    this.chunkService = new ChunkDatabaseService(this.db, this.adapter)
    this.outputService = new OutputDatabaseService(this.db, this.adapter)
    this.renderService = new RenderDatabaseService(this.db, this.adapter)
    this.layoutService = new LayoutDatabaseService(this.db, this.adapter)
    this.transactionService = new TransactionService(this.db, this.adapter)
  }

  /**
   * Create factory from legacy database instance (backward compatibility)
   */
  static fromDatabase(db: DrizzleDatabase): DatabaseServiceFactory {
    const adapter = new SqliteAdapter(db)
    return new DatabaseServiceFactory({ db, adapter })
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
   * Get novel-specific database operations
   */
  novels(): NovelDatabaseService {
    return this.novelService
  }

  /**
   * Get chunk-specific database operations
   */
  chunks(): ChunkDatabaseService {
    return this.chunkService
  }

  /**
   * Get output-specific database operations
   */
  outputs(): OutputDatabaseService {
    return this.outputService
  }

  /**
   * Get render-specific database operations
   */
  render(): RenderDatabaseService {
    return this.renderService
  }

  /**
   * Get layout-specific database operations
   */
  layout(): LayoutDatabaseService {
    return this.layoutService
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
  async executeAcrossDomains<T>(
    operation: (services: {
      episodes: EpisodeDatabaseService
      jobs: JobDatabaseService
      novels: NovelDatabaseService
      chunks: ChunkDatabaseService
      outputs: OutputDatabaseService
      render: RenderDatabaseService
      layout: LayoutDatabaseService
      tx: TransactionService
    }) => T | Promise<T>,
  ): Promise<T> {
    return this.transactionService.execute((_db) => {
      // Create transaction-aware instances for cross-domain operations
      const episodes = new EpisodeDatabaseService(this.db, this.adapter)
      const jobs = new JobDatabaseService(this.db, this.adapter)
      const novels = new NovelDatabaseService(this.db, this.adapter)
      const chunks = new ChunkDatabaseService(this.db, this.adapter)
      const outputs = new OutputDatabaseService(this.db, this.adapter)
      const render = new RenderDatabaseService(this.db, this.adapter)
      const layout = new LayoutDatabaseService(this.db, this.adapter)

      return operation({
        episodes,
        jobs,
        novels,
        chunks,
        outputs,
        render,
        layout,
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

  /**
   * Get the database adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter
  }
}

/**
 * Global factory instance
 * This will be initialized with the application's database connection
 */
let globalFactory: DatabaseServiceFactory | null = null

/**
 * Initialize the global database service factory with a database connection
 * If a factory already exists, it will be cleaned up first
 */
export function initializeDatabaseServiceFactory(
  connectionOrDb: DatabaseConnection<Database> | DrizzleDatabase,
): void {
  // Clean up existing factory if it exists
  if (globalFactory) {
    cleanup()
  }

  // Handle both connection objects and legacy database instances
  if ('adapter' in connectionOrDb) {
    // It's a DatabaseConnection
    globalFactory = new DatabaseServiceFactory(connectionOrDb)
  } else {
    // It's a legacy database instance - create adapter automatically
    globalFactory = DatabaseServiceFactory.fromDatabase(connectionOrDb as DrizzleDatabase)
  }
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
  novels: () => getDatabaseServiceFactory().novels(),
  chunks: () => getDatabaseServiceFactory().chunks(),
  outputs: () => getDatabaseServiceFactory().outputs(),
  render: () => getDatabaseServiceFactory().render(),
  layout: () => getDatabaseServiceFactory().layout(),
  transactions: () => getDatabaseServiceFactory().transactions(),
  executeAcrossDomains: async (
    operation: Parameters<DatabaseServiceFactory['executeAcrossDomains']>[0],
  ) => getDatabaseServiceFactory().executeAcrossDomains(operation),

  // Helper to check adapter capabilities
  isSync: () => getDatabaseServiceFactory().getAdapter().isSync(),
}
