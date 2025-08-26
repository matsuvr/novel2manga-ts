/**
 * Unified Database Services
 *
 * This module provides a unified, DRY, and SOLID-compliant approach to database access.
 * It replaces the monolithic DatabaseService with domain-specific services that follow
 * proper separation of concerns.
 *
 * Key principles:
 * - Single Responsibility: Each service handles one domain
 * - Open/Closed: Easy to extend with new domains
 * - Liskov Substitution: All services follow the same base contract
 * - Interface Segregation: Domain-specific interfaces
 * - Dependency Inversion: Services depend on abstractions
 */

// Core services
export { BaseDatabaseService } from './base-database-service'
// Factory and convenience exports
export {
  cleanup,
  DatabaseServiceFactory,
  db,
  getDatabaseServiceFactory,
  initializeDatabaseServiceFactory,
  isFactoryInitialized,
} from './database-service-factory'
// Domain-specific services
export { EpisodeDatabaseService } from './episode-database-service'
export type { JobProgress, JobWithProgress } from './job-database-service'
export { JobDatabaseService } from './job-database-service'
export type { AsyncTransactionOperation, SyncTransactionOperation } from './transaction-service'
export { TransactionService } from './transaction-service'

/**
 * Migration guide:
 *
 * Old pattern:
 * ```ts
 * const dbService = new DatabaseService(db)
 * await dbService.createEpisodes(episodes)
 * ```
 *
 * New pattern:
 * ```ts
 * import { db } from '@/services/database'
 * db.episodes().createEpisodes(episodes) // Synchronous, transaction-safe
 * ```
 *
 * For complex operations spanning multiple domains:
 * ```ts
 * db.executeAcrossDomains(({ episodes, jobs, tx }) => {
 *   // All operations run in a single transaction
 *   jobs.updateJobStatus(jobId, 'processing')
 *   episodes.createEpisodes(episodeList)
 * })
 * ```
 */
