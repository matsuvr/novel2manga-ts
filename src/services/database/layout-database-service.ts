import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { LayoutStatus } from '@/db/schema'
import { jobs, layoutStatus } from '@/db/schema'
import type { LayoutStatusModel } from '@/types/database-models'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Layout status database operations
 * Follows Single Responsibility Principle
 */
export class LayoutDatabaseService extends BaseDatabaseService {
  /**
   * Upsert layout status for an episode
   */
  async upsertLayoutStatus(params: {
    jobId: string
    episodeNumber: number
    totalPages: number
    totalPanels?: number
    layoutPath?: string | null
    error?: string | null
  }): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        const existing = tx
          .select()
          .from(layoutStatus)
          .where(
            and(
              eq(layoutStatus.jobId, params.jobId),
              eq(layoutStatus.episodeNumber, params.episodeNumber),
            ),
          )
          .limit(1)
          .all() as LayoutStatus[]

        if (existing[0]) {
          tx.update(layoutStatus)
            .set({
              isGenerated: true,
              layoutPath: params.layoutPath ?? existing[0].layoutPath,
              totalPages: params.totalPages,
              totalPanels: params.totalPanels ?? existing[0].totalPanels,
              generatedAt: now,
              lastError: params.error ?? null,
            })
            .where(eq(layoutStatus.id, existing[0].id))
            .run()
        } else {
          tx.insert(layoutStatus)
            .values({
              id: crypto.randomUUID(),
              jobId: params.jobId,
              episodeNumber: params.episodeNumber,
              isGenerated: true,
              layoutPath: params.layoutPath ?? null,
              totalPages: params.totalPages,
              totalPanels: params.totalPanels ?? null,
              generatedAt: now,
              lastError: params.error ?? null,
            })
            .run()
        }

        // Update job's total pages if needed
        const jobRow = tx
          .select({ totalPages: jobs.totalPages })
          .from(jobs)
          .where(eq(jobs.id, params.jobId))
          .limit(1)
          .all()[0]

        const currentTotal = jobRow?.totalPages ?? 0
        const newTotal = Math.max(currentTotal, params.totalPages)

        if (newTotal !== currentTotal) {
          tx.update(jobs)
            .set({ totalPages: newTotal, updatedAt: now })
            .where(eq(jobs.id, params.jobId))
            .run()
        }
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        const existing = await tx
          .select()
          .from(layoutStatus)
          .where(
            and(
              eq(layoutStatus.jobId, params.jobId),
              eq(layoutStatus.episodeNumber, params.episodeNumber),
            ),
          )
          .limit(1)

        if (existing[0]) {
          await tx
            .update(layoutStatus)
            .set({
              isGenerated: true,
              layoutPath: params.layoutPath ?? existing[0].layoutPath,
              totalPages: params.totalPages,
              totalPanels: params.totalPanels ?? existing[0].totalPanels,
              generatedAt: now,
              lastError: params.error ?? null,
            })
            .where(eq(layoutStatus.id, existing[0].id))
        } else {
          await tx.insert(layoutStatus).values({
            id: crypto.randomUUID(),
            jobId: params.jobId,
            episodeNumber: params.episodeNumber,
            isGenerated: true,
            layoutPath: params.layoutPath ?? null,
            totalPages: params.totalPages,
            totalPanels: params.totalPanels ?? null,
            generatedAt: now,
            lastError: params.error ?? null,
          })
        }

        // Update job's total pages if needed
        const jobRow = await tx
          .select({ totalPages: jobs.totalPages })
          .from(jobs)
          .where(eq(jobs.id, params.jobId))
          .limit(1)

        const currentTotal = jobRow[0]?.totalPages ?? 0
        const newTotal = Math.max(currentTotal, params.totalPages)

        if (newTotal !== currentTotal) {
          await tx
            .update(jobs)
            .set({ totalPages: newTotal, updatedAt: now })
            .where(eq(jobs.id, params.jobId))
        }
      })
    }
  }

  /**
   * Get layout status by job ID
   */
  async getLayoutStatusByJobId(jobId: string): Promise<LayoutStatusModel[]> {
    let results: LayoutStatus[]

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      results = drizzleDb
        .select()
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))
        .orderBy(layoutStatus.episodeNumber)
        .all()
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      results = await drizzleDb
        .select()
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))
        .orderBy(layoutStatus.episodeNumber)
    }

    // Convert to LayoutStatusModel
    return results.map((result) => ({
      id: result.id,
      jobId: result.jobId,
      episodeNumber: result.episodeNumber,
      isGenerated: result.isGenerated ?? false,
      layoutPath: result.layoutPath ?? undefined,
      totalPages: result.totalPages ?? undefined,
      totalPanels: result.totalPanels ?? undefined,
      generatedAt: result.generatedAt ? new Date(result.generatedAt) : undefined,
      retryCount: result.retryCount ?? 0,
      lastError: result.lastError ?? undefined,
      createdAt: result.createdAt ? new Date(result.createdAt) : new Date(0),
    }))
  }

  /**
   * Get layout status for a specific episode
   */
  async getLayoutStatus(jobId: string, episodeNumber: number): Promise<LayoutStatus | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const rows = drizzleDb
        .select()
        .from(layoutStatus)
        .where(and(eq(layoutStatus.jobId, jobId), eq(layoutStatus.episodeNumber, episodeNumber)))
        .limit(1)
        .all()

      return (rows[0] as LayoutStatus | undefined) ?? null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(layoutStatus)
        .where(and(eq(layoutStatus.jobId, jobId), eq(layoutStatus.episodeNumber, episodeNumber)))
        .limit(1)

      return (rows[0] as LayoutStatus | undefined) ?? null
    }
  }

  /**
   * Recompute job total pages from layout status
   */
  async recomputeJobTotalPages(jobId: string): Promise<number> {
    let sum: number

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      // Sum total pages from layout_status for this job
      const rows = drizzleDb
        .select({ total: layoutStatus.totalPages })
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))
        .all() as Array<{ total: number | null }>

      sum = rows.reduce((acc, r) => acc + (r.total || 0), 0)

      // Update job's total pages
      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({ totalPages: sum, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      // Sum total pages from layout_status for this job
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select({ total: layoutStatus.totalPages })
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))

      sum = rows.reduce((acc, r) => acc + (r.total || 0), 0)

      // Update job's total pages
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({ totalPages: sum, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
      })
    }

    return sum
  }

  /**
   * Recompute job processed episodes from layout status
   */
  async recomputeJobProcessedEpisodes(jobId: string): Promise<number> {
    let count: number

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const rows = drizzleDb
        .select({ generated: layoutStatus.isGenerated })
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))
        .all() as Array<{ generated: boolean | null }>

      count = rows.reduce((acc, r) => acc + (r.generated ? 1 : 0), 0)

      // Update job's processed episodes
      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({ processedEpisodes: count, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select({ generated: layoutStatus.isGenerated })
        .from(layoutStatus)
        .where(eq(layoutStatus.jobId, jobId))

      count = rows.reduce((acc, r) => acc + (r.generated ? 1 : 0), 0)

      // Update job's processed episodes
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({ processedEpisodes: count, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
      })
    }

    return count
  }

  /**
   * Update layout error
   */
  async updateLayoutError(jobId: string, episodeNumber: number, error: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        const existing = tx
          .select({ id: layoutStatus.id, retryCount: layoutStatus.retryCount })
          .from(layoutStatus)
          .where(and(eq(layoutStatus.jobId, jobId), eq(layoutStatus.episodeNumber, episodeNumber)))
          .limit(1)
          .all()[0]

        if (existing) {
          tx.update(layoutStatus)
            .set({
              lastError: error,
              retryCount: (existing.retryCount ?? 0) + 1,
            })
            .where(eq(layoutStatus.id, existing.id))
            .run()
        } else {
          tx.insert(layoutStatus)
            .values({
              id: crypto.randomUUID(),
              jobId,
              episodeNumber,
              isGenerated: false,
              lastError: error,
              retryCount: 1,
            })
            .run()
        }
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        const existing = await tx
          .select({ id: layoutStatus.id, retryCount: layoutStatus.retryCount })
          .from(layoutStatus)
          .where(and(eq(layoutStatus.jobId, jobId), eq(layoutStatus.episodeNumber, episodeNumber)))
          .limit(1)

        if (existing[0]) {
          await tx
            .update(layoutStatus)
            .set({
              lastError: error,
              retryCount: (existing[0].retryCount ?? 0) + 1,
            })
            .where(eq(layoutStatus.id, existing[0].id))
        } else {
          await tx.insert(layoutStatus).values({
            id: crypto.randomUUID(),
            jobId,
            episodeNumber,
            isGenerated: false,
            lastError: error,
            retryCount: 1,
          })
        }
      })
    }
  }

  /**
   * Delete layout status for a job
   */
  async deleteLayoutStatusByJob(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(layoutStatus).where(eq(layoutStatus.jobId, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(layoutStatus).where(eq(layoutStatus.jobId, jobId))
      })
    }
  }
}
