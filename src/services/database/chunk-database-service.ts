import { and, asc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { Chunk, NewChunk } from '@/db/schema'
import { chunks } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Chunk-specific database operations
 * Follows Single Responsibility Principle
 */
export class ChunkDatabaseService extends BaseDatabaseService {
  /**
   * Create a new chunk
   */
  async createChunk(chunk: Omit<NewChunk, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
    const id = chunk.id ?? crypto.randomUUID()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(chunks)
          .values({
            id,
            novelId: chunk.novelId,
            jobId: chunk.jobId,
            chunkIndex: chunk.chunkIndex,
            contentPath: chunk.contentPath,
            startPosition: chunk.startPosition,
            endPosition: chunk.endPosition,
            wordCount: chunk.wordCount,
          })
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(chunks).values({
          id,
          novelId: chunk.novelId,
          jobId: chunk.jobId,
          chunkIndex: chunk.chunkIndex,
          contentPath: chunk.contentPath,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          wordCount: chunk.wordCount,
        })
      })
    }

    return id
  }

  /**
   * Create multiple chunks in batch
   */
  async createChunksBatch(payloads: Array<Omit<NewChunk, 'id' | 'createdAt'>>): Promise<void> {
    if (payloads.length === 0) return

    const toInsert = payloads.map((c) => ({
      id: crypto.randomUUID(),
      novelId: c.novelId,
      jobId: c.jobId,
      chunkIndex: c.chunkIndex,
      contentPath: c.contentPath,
      startPosition: c.startPosition,
      endPosition: c.endPosition,
      wordCount: c.wordCount,
    }))

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(chunks).values(toInsert).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(chunks).values(toInsert)
      })
    }
  }

  /**
   * Get chunks by job ID
   */
  async getChunksByJobId(jobId: string): Promise<Chunk[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb
        .select()
        .from(chunks)
        .where(eq(chunks.jobId, jobId))
        .orderBy(asc(chunks.chunkIndex))
        .all() as Chunk[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const results = await drizzleDb
        .select()
        .from(chunks)
        .where(eq(chunks.jobId, jobId))
        .orderBy(asc(chunks.chunkIndex))

      return results as Chunk[]
    }
  }

  /**
   * Get a specific chunk by job ID and index
   */
  async getChunk(jobId: string, chunkIndex: number): Promise<Chunk | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const results = drizzleDb
        .select()
        .from(chunks)
        .where(and(eq(chunks.jobId, jobId), eq(chunks.chunkIndex, chunkIndex)))
        .limit(1)
        .all()

      return results.length > 0 ? (results[0] as Chunk) : null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const results = await drizzleDb
        .select()
        .from(chunks)
        .where(and(eq(chunks.jobId, jobId), eq(chunks.chunkIndex, chunkIndex)))
        .limit(1)

      return results.length > 0 ? (results[0] as Chunk) : null
    }
  }

  /**
   * Update chunk content path
   */
  async updateChunkContentPath(
    jobId: string,
    chunkIndex: number,
    contentPath: string,
  ): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(chunks)
          .set({ contentPath })
          .where(and(eq(chunks.jobId, jobId), eq(chunks.chunkIndex, chunkIndex)))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(chunks)
          .set({ contentPath })
          .where(and(eq(chunks.jobId, jobId), eq(chunks.chunkIndex, chunkIndex)))
      })
    }
  }

  /**
   * Delete chunks by job ID
   */
  async deleteChunksByJobId(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(chunks).where(eq(chunks.jobId, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(chunks).where(eq(chunks.jobId, jobId))
      })
    }
  }
}
