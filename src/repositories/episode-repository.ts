import type { Episode, NewEpisode } from '@/db'
import { logError } from '@/utils/api-error'
import type { EpisodeDbPort, TransactionPort } from './ports'
import { hasEpisodeWriteCapabilities } from './ports'

// Re-export for backward compatibility
export type { EpisodeDbPort } from './ports'

export class EpisodeRepository {
  constructor(private readonly db: EpisodeDbPort & Partial<TransactionPort>) {}

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
      const run = async () => {
        if (!hasEpisodeWriteCapabilities(this.db as EpisodeDbPort)) {
          throw new Error('Episode write capability not available')
        }
        await (this.db as import('./ports').EpisodeDbPortRW).createEpisodes(episodes)
      }
      if (typeof this.db.withTransaction === 'function') {
        await this.db.withTransaction(async () => {
          await run()
        })
      } else {
        await run()
      }
    } catch (error) {
      // Log and rethrow to be handled by upper layers
      logError('Failed to bulk upsert episodes', error, {
        episodesCount: episodes.length,
      })
      throw error
    }
  }
}
