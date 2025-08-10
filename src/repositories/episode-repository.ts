import type { Episode, NewEpisode } from '@/db'

export interface EpisodeDbPort {
  getEpisodesByJobId(jobId: string): Promise<Episode[]>
  createEpisodes?(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void>
}

export class EpisodeRepository {
  constructor(private readonly db: EpisodeDbPort) {}

  async getByJobId(jobId: string): Promise<Episode[]> {
    return this.db.getEpisodesByJobId(jobId)
  }

  async bulkUpsert(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (!this.db.createEpisodes) return
    if (episodes.length === 0) return
    await this.db.createEpisodes(episodes)
  }
}
