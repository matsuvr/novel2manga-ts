import type { DatabaseService } from '@/services/database'
import { getDatabaseService } from '@/services/db-factory'

import { EpisodeRepository } from './episode-repository'
import { JobRepository } from './job-repository'
import { NovelRepository } from './novel-repository'
import { OutputRepository } from './output-repository'

/**
 * Repository Factory implementing dependency injection pattern.
 * Centralizes repository instantiation and ensures consistent dependencies.
 *
 * This factory follows SOLID principles:
 * - Single Responsibility: Only handles repository creation
 * - Open/Closed: Can be extended with new repositories without modifying existing code
 * - Dependency Inversion: Repositories depend on port interfaces, not concrete implementations
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory | null = null

  // Repository instances cache (singleton per factory instance)
  private episodeRepo: EpisodeRepository | null = null
  private jobRepo: JobRepository | null = null
  private novelRepo: NovelRepository | null = null
  private outputRepo: OutputRepository | null = null

  constructor(private readonly dbService: DatabaseService = getDatabaseService()) {}

  /**
   * Get singleton factory instance with default database service
   */
  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory()
    }
    return RepositoryFactory.instance
  }

  /**
   * Create factory with custom database service (useful for testing)
   */
  static createWithDb(dbService: DatabaseService): RepositoryFactory {
    return new RepositoryFactory(dbService)
  }

  /**
   * Reset singleton instance (for testing)
   */
  static reset(): void {
    RepositoryFactory.instance = null
  }

  /**
   * Get or create EpisodeRepository instance
   */
  getEpisodeRepository(): EpisodeRepository {
    if (!this.episodeRepo) {
      this.episodeRepo = new EpisodeRepository(this.dbService)
    }
    return this.episodeRepo
  }

  /**
   * Get or create JobRepository instance
   */
  getJobRepository(): JobRepository {
    if (!this.jobRepo) {
      this.jobRepo = new JobRepository(this.dbService)
    }
    return this.jobRepo
  }

  /**
   * Get or create NovelRepository instance
   */
  getNovelRepository(): NovelRepository {
    if (!this.novelRepo) {
      this.novelRepo = new NovelRepository(this.dbService)
    }
    return this.novelRepo
  }

  /**
   * Get or create OutputRepository instance
   */
  getOutputRepository(): OutputRepository {
    if (!this.outputRepo) {
      this.outputRepo = new OutputRepository(this.dbService)
    }
    return this.outputRepo
  }

  /**
   * Get all repositories at once (useful for complex operations)
   */
  getAllRepositories() {
    return {
      episode: this.getEpisodeRepository(),
      job: this.getJobRepository(),
      novel: this.getNovelRepository(),
      output: this.getOutputRepository(),
    } as const
  }

  /**
   * Clear cached repository instances (useful for testing)
   */
  clearCache(): void {
    this.episodeRepo = null
    this.jobRepo = null
    this.novelRepo = null
    this.outputRepo = null
  }
}

// Export convenience function for getting default factory
export const getRepositoryFactory = () => RepositoryFactory.getInstance()

// Export convenience functions for direct repository access
export const getEpisodeRepository = () => getRepositoryFactory().getEpisodeRepository()
export const getJobRepository = () => getRepositoryFactory().getJobRepository()
export const getNovelRepository = () => getRepositoryFactory().getNovelRepository()
export const getOutputRepository = () => getRepositoryFactory().getOutputRepository()
