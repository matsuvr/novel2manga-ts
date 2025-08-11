import type { Episode, NewEpisode } from '@/db'
import { logError } from '@/utils/api-error'

/**
 * Database port for Episode entity.
 *
 * Notes on optional methods:
 * - createEpisodes is optional to allow read-only implementations (e.g., in test or limited runtimes).
 *   When unavailable, callers of bulkUpsert should expect a no-op; a warning will be logged.
 */
export interface EpisodeDbPort {
  /** Fetch all episodes for a job (ordered by episodeNumber ascending). */
  getEpisodesByJobId(jobId: string): Promise<Episode[]>
  /**
   * Bulk create or upsert episodes. Implementations should upsert on (jobId, episodeNumber).
   * Optional to support read-only adapters.
   */
  createEpisodes?(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void>
}

export class EpisodeRepository {
  constructor(private readonly db: EpisodeDbPort) {}

  async getByJobId(jobId: string): Promise<Episode[]> {
    return this.db.getEpisodesByJobId(jobId)
  }

  async bulkUpsert(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (episodes.length === 0) return

    if (!this.db.createEpisodes) {
      // Warn and no-op when write capability is unavailable
      logError(
        'EpisodeDbPort.createEpisodes is not implemented; bulkUpsert skipped',
        undefined,
        {
          episodesCount: episodes.length,
        },
        'warn',
      )
      return
    }

    try {
      await this.db.createEpisodes(episodes)
    } catch (error) {
      // Log and rethrow to be handled by upper layers
      logError('Failed to bulk upsert episodes', error, { episodesCount: episodes.length })
      throw error
    }
  }
}
