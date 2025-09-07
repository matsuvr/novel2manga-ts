import { and, asc, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { Episode, NewEpisode } from '@/db/schema'
import { episodes, jobs } from '@/db/schema'
import { makeEpisodeId } from '@/utils/ids'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Episode-specific database operations
 * Follows Single Responsibility Principle
 */
export class EpisodeDatabaseService extends BaseDatabaseService {
  /**
   * Create multiple episodes in a single transaction
   * Uses unified transaction pattern for consistency
   */
  async createEpisodes(episodeList: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (episodeList.length === 0) return

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

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
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
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .insert(episodes)
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

        // Update job total episodes count
        const jobId = episodeList[0].jobId
        type CountResult = { count: number }
        const total = await tx
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(episodes)
          .where(eq(episodes.jobId, jobId))
        const totalEpisodes = (total[0] as CountResult)?.count ?? 0

        await tx
          .update(jobs)
          .set({ totalEpisodes, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Create a single episode
   */
  async createEpisode(episode: Omit<NewEpisode, 'id' | 'createdAt'>): Promise<void> {
    await this.createEpisodes([episode])
  }

  /**
   * Get episodes by job ID
   */
  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    const drizzleDb = this.db as DrizzleDatabase
    const query = drizzleDb
      .select()
      .from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(asc(episodes.episodeNumber))

    if (this.isSync()) {
      return query.all()
    }
    return await query
  }

  /**
   * Update episode text path
   */
  async updateEpisodeTextPath(
    jobId: string,
    episodeNumber: number,
    episodePath: string,
  ): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx.update(episodes)
          .set({ episodeTextPath: episodePath })
          .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(episodes)
          .set({ episodeTextPath: episodePath })
          .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
      })
    }
  }

  /**
   * Get a specific episode by job ID and episode number
   */
  async getEpisode(jobId: string, episodeNumber: number): Promise<Episode | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const results = drizzleDb
        .select()
        .from(episodes)
        .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
        .limit(1)
        .all()
      return results.length > 0 ? results[0] : null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const results = await drizzleDb
        .select()
        .from(episodes)
        .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
        .limit(1)
      return results.length > 0 ? results[0] : null
    }
  }

  /**
   * Delete episodes by job ID
   */
  async deleteEpisodesByJobId(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx.delete(episodes).where(eq(episodes.jobId, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(episodes).where(eq(episodes.jobId, jobId))
      })
    }
  }

  /**
   * Update episode metadata
   */
  async updateEpisode(
    jobId: string,
    episodeNumber: number,
    updates: Partial<Pick<Episode, 'title' | 'summary' | 'confidence'>>,
  ): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx.update(episodes)
          .set(updates)
          .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(episodes)
          .set(updates)
          .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
      })
    }
  }
}
