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
  // TTL を環境変数で調整可能にし、運用でキャッシュ戦略を変更しやすくする
  private static readonly CACHE_TTL_MS = (() => {
    const v = process.env.REPOSITORY_FACTORY_TTL_MS
    const parsed = v ? Number.parseInt(v, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000 * 60 * 30
  })() // 30分 デフォルト TTL（長期稼働メモリ管理対策）
  private static lastAccess = Date.now()

  // Repository instances cache (singleton per factory instance)
  private episodeRepo: EpisodeRepository | null = null
  private jobRepo: JobRepository | null = null
  private novelRepo: NovelRepository | null = null
  private outputRepo: OutputRepository | null = null

  constructor(private readonly dbService: DatabaseService = getDatabaseService()) {
    this.assertValidDbService(dbService)
  }

  // 型ガード + ランタイム検証（unknownキャスト除去）
  // 最低限利用するメソッドのみチェックし、将来的にここを拡張する
  // eslint-disable-next-line class-methods-use-this
  private assertValidDbService(db: unknown): asserts db is DatabaseService {
    if (!db || typeof db !== 'object') {
      throw new Error('RepositoryFactory: invalid DatabaseService instance')
    }
    const candidate = db as Record<string, unknown>
    const required: Array<keyof DatabaseService & string> = ['getJob', 'getNovel']
    for (const key of required) {
      if (!(key in candidate) || typeof candidate[key] !== 'function') {
        throw new Error(`RepositoryFactory: dbService missing method ${key}`)
      }
    }
  }

  /**
   * Get singleton factory instance with default database service
   */
  static getInstance(): RepositoryFactory {
    // TTL 経過後はキャッシュをリフレッシュ（メモリリークリスク低減）
    if (
      RepositoryFactory.instance &&
      Date.now() - RepositoryFactory.lastAccess > RepositoryFactory.CACHE_TTL_MS
    ) {
      RepositoryFactory.instance.clearCache()
      RepositoryFactory.instance = null
    }
    // In test environment, always return a fresh instance to avoid cross-test pollution
    if (process.env.NODE_ENV === 'test') {
      return new RepositoryFactory()
    }
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory()
    }
    RepositoryFactory.lastAccess = Date.now()
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
