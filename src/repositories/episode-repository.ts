import type { Episode, NewEpisode } from '@/db'
import { logError } from '@/utils/api-error'
import type { EpisodeDbPort } from './ports'
import { hasEpisodeWriteCapabilities } from './ports'

// Re-export for backward compatibility
export type { EpisodeDbPort } from './ports'

export class EpisodeRepository {
  constructor(private readonly db: EpisodeDbPort) {}

  async getByJobId(jobId: string): Promise<Episode[]> {
    return this.db.getEpisodesByJobId(jobId)
  }

  async bulkUpsert(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (episodes.length === 0) return

    if (!hasEpisodeWriteCapabilities(this.db)) {
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
