import { and, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { chunkConversionStatus } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

export type ChunkConversionStatusRecord = typeof chunkConversionStatus.$inferSelect

export class ChunkConversionDatabaseService extends BaseDatabaseService {
  async getStatusesByJob(jobId: string): Promise<ChunkConversionStatusRecord[]> {
    if (!this.isSync()) {
      // Async adapters not supported in this repo
      throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
    }
    const drizzleDb = this.db as DrizzleDatabase
    return drizzleDb
      .select()
      .from(chunkConversionStatus)
      .where(eq(chunkConversionStatus.jobId, jobId))
      .all()
  }

  async getStatus(jobId: string, chunkIndex: number): Promise<ChunkConversionStatusRecord | null> {
    if (!this.isSync()) {
      throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
    }
    const drizzleDb = this.db as DrizzleDatabase
    const result = drizzleDb
      .select()
      .from(chunkConversionStatus)
      .where(and(eq(chunkConversionStatus.jobId, jobId), eq(chunkConversionStatus.chunkIndex, chunkIndex)))
      .limit(1)
      .all()
    return result.length > 0 ? result[0] : null
  }

  async ensureStatuses(jobId: string, chunkIndices: number[]): Promise<void> {
    if (chunkIndices.length === 0) return

    const uniqueIndices = [...new Set(chunkIndices)].sort((a, b) => a - b)
    const existing = await this.getStatusesByJob(jobId)
    const existingSet = new Set(existing.map((status) => status.chunkIndex))

    const now = new Date().toISOString()
    const toInsert = uniqueIndices
      .filter((index) => !existingSet.has(index))
      .map((index) => ({
        jobId,
        chunkIndex: index,
        status: 'pending' as const,
        createdAt: now,
        updatedAt: now,
      }))

    if (toInsert.length === 0) return

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx.insert(chunkConversionStatus).values(toInsert).run()
      })
      return
    }

    throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
  }

  async markProcessing(jobId: string, chunkIndex: number): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx
          .insert(chunkConversionStatus)
          .values({
            jobId,
            chunkIndex,
            status: 'processing',
            startedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [chunkConversionStatus.jobId, chunkConversionStatus.chunkIndex],
            set: {
              status: 'processing',
              errorMessage: null,
              startedAt: now,
              updatedAt: now,
            },
          })
          .run()
      })
      return
    }

    throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
  }

  async markCompleted(jobId: string, chunkIndex: number, resultPath: string | null): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx
          .update(chunkConversionStatus)
          .set({
            status: 'completed',
            resultPath: resultPath ?? null,
            errorMessage: null,
            completedAt: now,
            updatedAt: now,
          })
          .where(and(eq(chunkConversionStatus.jobId, jobId), eq(chunkConversionStatus.chunkIndex, chunkIndex)))
          .run()
      })
      return
    }

    throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
  }

  async markFailed(jobId: string, chunkIndex: number, errorMessage: string): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        tx
          .update(chunkConversionStatus)
          .set({
            status: 'failed',
            errorMessage,
            retryCount: sql`${chunkConversionStatus.retryCount} + 1`,
            updatedAt: now,
          })
          .where(and(eq(chunkConversionStatus.jobId, jobId), eq(chunkConversionStatus.chunkIndex, chunkIndex)))
          .run()
      })
      return
    }

    throw new Error('Async adapters are not supported. Use the sync BetterSQLite3 adapter.')
  }
}
