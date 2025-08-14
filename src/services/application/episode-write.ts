import type { NewEpisode } from '@/db'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { getDatabaseService } from '@/services/db-factory'

export class EpisodeWriteService {
  private readonly episodeRepo: EpisodeRepository

  constructor() {
    const db = getDatabaseService()
    const { episode } = adaptAll(db)
    this.episodeRepo = new EpisodeRepository(episode)
  }

  async bulkUpsert(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    await this.episodeRepo.bulkUpsert(episodes)
  }
}
