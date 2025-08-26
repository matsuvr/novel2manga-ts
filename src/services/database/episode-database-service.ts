import { and, eq, sql } from 'drizzle-orm'
import type { Episode, NewEpisode } from '@/db/schema'
import { episodes, jobs } from '@/db/schema'
import { makeEpisodeId } from '@/utils/ids'
import { BaseDatabaseService } from './base-database-service'

/**
 * Episode-specific database operations
 * Follows Single Responsibility Principle
 */
export class EpisodeDatabaseService extends BaseDatabaseService {
  /**
   * Create multiple episodes in a single transaction
   * Uses unified transaction pattern for consistency
   */
  createEpisodes(episodeList: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): void {
    if (episodeList.length === 0) return

    this.executeInTransaction((tx) => {
      const toInsert = episodeList.map((episode) => ({
        id: makeEpisodeId(episode.jobId, episode.episodeNumber),
        novelId: episode.novelId,
        jobId: episode.jobId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        summary: episode.summary,
        startChunk: episode.startChunk,
        startCharIndex: episode.startCharIndex,
        endChunk: episode.endChunk,
        endCharIndex: episode.endCharIndex,
        confidence: episode.confidence,
      }))

      tx.insert(episodes)
        .values(toInsert)
        .onConflictDoUpdate({
          target: [episodes.jobId, episodes.episodeNumber],
          set: {
            title: sql`excluded.title`,
            summary: sql`excluded.summary`,
            startChunk: sql`excluded.start_chunk`,
            startCharIndex: sql`excluded.start_char_index`,
            endChunk: sql`excluded.end_chunk`,
            endCharIndex: sql`excluded.end_char_index`,
            confidence: sql`excluded.confidence`,
          },
        })
        .run()

      // Update job total episodes count
      const jobId = episodeList[0].jobId
      type CountResult = { count: number }
      const total = tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(episodes)
        .where(eq(episodes.jobId, jobId))
        .all() as CountResult[]
      const totalEpisodes = total[0]?.count ?? 0

      tx.update(jobs)
        .set({ totalEpisodes, updatedAt: new Date().toISOString() })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  /**
   * Create a single episode
   */
  createEpisode(episode: Omit<NewEpisode, 'id' | 'createdAt'>): void {
    this.createEpisodes([episode])
  }

  /**
   * Get episodes by job ID
   */
  getEpisodesByJobId(jobId: string): Episode[] {
    return this.db
      .select()
      .from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(episodes.episodeNumber)
      .all()
  }

  /**
   * Update episode text path
   */
  updateEpisodeTextPath(jobId: string, episodeNumber: number, episodePath: string): void {
    this.executeInTransaction((tx) => {
      tx.update(episodes)
        .set({ episodeTextPath: episodePath })
        .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
        .run()
    })
  }
}
