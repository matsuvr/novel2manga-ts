import type { NewEpisode } from '@/db'
import { db } from '@/services/database/index'

export class EpisodeWriteService {
  async bulkUpsert(episodesList: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    db.episodes().createEpisodes(episodesList)
  }
}
