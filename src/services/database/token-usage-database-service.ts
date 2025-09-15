import crypto from 'node:crypto'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { tokenUsage } from '@/db/schema'
import { ensureCreatedAtString } from '@/utils/db'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

interface AggregateRow {
  jobId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type JobTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface RecordTokenUsageParams {
  jobId: string
  agentName: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  stepName?: string
  chunkIndex?: number
  episodeNumber?: number
}

export class TokenUsageDatabaseService extends BaseDatabaseService {
  /** Insert one token usage record */
  async record(params: RecordTokenUsageParams): Promise<void> {
    const now = new Date().toISOString()
    const values: schema.NewTokenUsage = {
      id: crypto.randomUUID(),
      jobId: params.jobId,
      agentName: params.agentName,
      provider: params.provider,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      cost: params.cost,
      stepName: params.stepName,
      chunkIndex: params.chunkIndex,
      episodeNumber: params.episodeNumber,
      createdAt: now,
    }
    if (this.isSync()) {
      const db = this.db as DrizzleDatabase
      db.insert(tokenUsage).values(values).run()
      return
    }
    const db = this.db as DrizzleDatabase
    await db.insert(tokenUsage).values(values)
    return
  }

  /** List token usage rows for a job (newest first) */
  async listByJob(jobId: string): Promise<schema.TokenUsage[]> {
    if (this.isSync()) {
      const db = this.db as DrizzleDatabase
      const rows = db
        .select()
        .from(tokenUsage)
        .where(eq(tokenUsage.jobId, jobId))
        .orderBy(desc(tokenUsage.createdAt))
        .all() as Record<string, unknown>[]

      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) } as schema.TokenUsage))
    }
    const db = this.db as DrizzleDatabase
    const rows = await db
      .select()
      .from(tokenUsage)
      .where(eq(tokenUsage.jobId, jobId))
      .orderBy(desc(tokenUsage.createdAt))

    return (rows as Record<string, unknown>[]).map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) } as schema.TokenUsage))
  }

  /**
   * Get aggregated token usage totals for multiple jobs
   */
  async getTotalsByJobIds(jobIds: readonly string[]): Promise<Record<string, JobTokenUsage>> {
    if (jobIds.length === 0) return {}

    const db = this.db as DrizzleDatabase
    const query = db
      .select({
        jobId: tokenUsage.jobId,
        promptTokens: sql<number>`sum(${tokenUsage.promptTokens})`.mapWith(Number),
        completionTokens: sql<number>`sum(${tokenUsage.completionTokens})`.mapWith(Number),
        totalTokens: sql<number>`sum(${tokenUsage.totalTokens})`.mapWith(Number),
      })
      .from(tokenUsage)
      .where(inArray(tokenUsage.jobId, jobIds))
      .groupBy(tokenUsage.jobId)

    const rows = this.isSync() ? (query.all() as AggregateRow[]) : ((await query) as AggregateRow[])

    return Object.fromEntries(
      rows.map((row): [string, JobTokenUsage] => [
        row.jobId,
        {
          promptTokens: row.promptTokens ?? 0,
          completionTokens: row.completionTokens ?? 0,
          totalTokens: row.totalTokens ?? 0,
        },
      ]),
    )
  }
}
