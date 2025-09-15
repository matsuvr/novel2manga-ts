import type { NewEpisode } from '@/db'
import { db } from '@/services/database'

export class EpisodeWriteService {
  async bulkUpsert(episodesList: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (episodesList.length === 0) return

    // Get the jobId from the first episode (all episodes should have the same jobId)
    const jobId = episodesList[0].jobId

    // Delete existing episodes for this job before inserting new ones
    // This handles the case where episode bundling changes episode numbers
    await db.episodes().deleteEpisodesByJobId(jobId)

    // Insert the new episodes
    await db.episodes().createEpisodes(episodesList)
  }
}
