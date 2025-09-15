import crypto from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { RenderStatus } from '@/db/schema'
import { jobs, outputs, renderStatus } from '@/db/schema'
import { ensureCreatedAtString } from '@/utils/db'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Render status database operations
 * Follows Single Responsibility Principle
 */
export class RenderDatabaseService extends BaseDatabaseService {
  private buildRenderStatusSelect(
    db: DrizzleDatabase,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
  ) {
    return db
      .select()
      .from(renderStatus)
      .where(
        and(
          eq(renderStatus.jobId, jobId),
          eq(renderStatus.episodeNumber, episodeNumber),
          eq(renderStatus.pageNumber, pageNumber),
        ),
      )
  }

  /**
   * Create a render entry (placeholder) for a job and return the generated id
   */
  async createRenderEntry(params: {
    jobId: string
    pageCount: number
    requestedBy: string
    settings?: unknown
  }): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const record: typeof outputs.$inferInsert = {
      id,
      novelId: null as unknown as string,
      jobId: params.jobId,
      userId: params.requestedBy,
      outputType: 'render',
      outputPath: null as unknown as string,
      fileSize: null as unknown as number,
      pageCount: params.pageCount,
      metadataPath: null as unknown as string,
      createdAt: now,
    }

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        // Use outputs table as a placeholder for render entries
        tx.insert(outputs).values(record).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(outputs).values(record)
      })
    }

    return id
  }
  /**
   * Get render status for a specific page
   */
  async getRenderStatus(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
  ): Promise<RenderStatus | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = this.buildRenderStatusSelect(drizzleDb, jobId, episodeNumber, pageNumber)
        .limit(1)
        .all()
      const row = rows[0] as Record<string, unknown> | undefined
      if (!row) return null
      return ({
        ...(row as Record<string, unknown>),
        createdAt: ensureCreatedAtString(row),
        renderedAt: row.renderedAt ? new Date(String(row.renderedAt)).toISOString() : undefined,
      } as RenderStatus)
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await this.buildRenderStatusSelect(
        drizzleDb,
        jobId,
        episodeNumber,
        pageNumber,
      ).limit(1)
      const row = rows[0] as Record<string, unknown> | undefined
      if (!row) return null
      return ({
        ...(row as Record<string, unknown>),
        createdAt: ensureCreatedAtString(row),
        renderedAt: row.renderedAt ? new Date(String(row.renderedAt)).toISOString() : undefined,
      } as RenderStatus)
    }
  }

  /**
   * Get all render status records for a job
   */
  async getAllRenderStatusByJob(jobId: string): Promise<RenderStatus[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const rows = drizzleDb
        .select()
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .orderBy(desc(renderStatus.renderedAt))
        .all() as Record<string, unknown>[]

      return rows.map((r) => ({
        ...(r as Record<string, unknown>),
        createdAt: ensureCreatedAtString(r),
        renderedAt: r.renderedAt ? new Date(String(r.renderedAt)).toISOString() : undefined,
      } as RenderStatus))
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .orderBy(desc(renderStatus.renderedAt))

      return (rows as Record<string, unknown>[]).map((r) => ({
        ...(r as Record<string, unknown>),
        createdAt: ensureCreatedAtString(r),
        renderedAt: r.renderedAt ? new Date(String(r.renderedAt)).toISOString() : undefined,
      } as RenderStatus))
    }
  }

  /**
   * Get render status for a specific episode
   */
  async getRenderStatusByEpisode(jobId: string, episodeNumber: number): Promise<RenderStatus[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const rows = drizzleDb
        .select()
        .from(renderStatus)
        .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
        .orderBy(renderStatus.pageNumber)
        .all() as Record<string, unknown>[]

      return rows.map((r) => ({
        ...(r as Record<string, unknown>),
        createdAt: ensureCreatedAtString(r),
        renderedAt: r.renderedAt ? new Date(String(r.renderedAt)).toISOString() : undefined,
      } as RenderStatus))
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(renderStatus)
        .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
        .orderBy(renderStatus.pageNumber)

      return (rows as Record<string, unknown>[]).map((r) => ({
        ...(r as Record<string, unknown>),
        createdAt: ensureCreatedAtString(r),
        renderedAt: r.renderedAt ? new Date(String(r.renderedAt)).toISOString() : undefined,
      } as RenderStatus))
    }
  }

  /**
   * Upsert a render status row and maintain job.renderedPages and completion.
   * - If status transitions from not rendered to rendered, increments renderedPages.
   * - When renderedPages reaches totalPages (>0), marks job completed.
   */
  async upsertRenderStatus(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    status: Partial<
      Pick<
        RenderStatus,
        'isRendered' | 'imagePath' | 'thumbnailPath' | 'width' | 'height' | 'fileSize'
      >
    >,
  ): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      drizzleDb.transaction((tx) => {
        this.upsertRenderStatusTxSync(tx, jobId, episodeNumber, pageNumber, status, now)
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await this.upsertRenderStatusTxAsync(tx, jobId, episodeNumber, pageNumber, status, now)
      })
    }
  }

  private buildJobSelect(tx: DrizzleDatabase, jobId: string) {
    return tx
      .select({ renderedPages: jobs.renderedPages, totalPages: jobs.totalPages })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
  }

  private createRenderStatusUpdate(
    status: Partial<
      Pick<
        RenderStatus,
        'isRendered' | 'imagePath' | 'thumbnailPath' | 'width' | 'height' | 'fileSize'
      >
    >,
    existing: RenderStatus,
    now: string,
  ): Partial<typeof renderStatus.$inferInsert> {
    return {
      isRendered: status.isRendered ?? existing.isRendered,
      imagePath: status.imagePath ?? existing.imagePath,
      thumbnailPath: status.thumbnailPath ?? existing.thumbnailPath,
      width: status.width ?? existing.width,
      height: status.height ?? existing.height,
      fileSize: status.fileSize ?? existing.fileSize,
      renderedAt: now,
    }
  }

  private createRenderStatusInsert(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    status: Partial<
      Pick<
        RenderStatus,
        'isRendered' | 'imagePath' | 'thumbnailPath' | 'width' | 'height' | 'fileSize'
      >
    >,
    now: string,
  ): typeof renderStatus.$inferInsert {
    return {
      id: crypto.randomUUID(),
      jobId,
      episodeNumber,
      pageNumber,
      isRendered: status.isRendered ?? false,
      imagePath: status.imagePath,
      thumbnailPath: status.thumbnailPath,
      width: status.width,
      height: status.height,
      fileSize: status.fileSize,
      renderedAt: now,
    }
  }

  private completeJobIfNeededSync(
    tx: DrizzleDatabase,
    jobId: string,
    newRenderedPages: number,
    totalPages: number,
    now: string,
  ): void {
    if (totalPages > 0 && newRenderedPages >= totalPages) {
      tx.update(jobs).set({ renderCompleted: true, updatedAt: now }).where(eq(jobs.id, jobId)).run()
    }
  }

  private async completeJobIfNeededAsync(
    tx: DrizzleDatabase,
    jobId: string,
    newRenderedPages: number,
    totalPages: number,
    now: string,
  ): Promise<void> {
    if (totalPages > 0 && newRenderedPages >= totalPages) {
      await tx.update(jobs).set({ renderCompleted: true, updatedAt: now }).where(eq(jobs.id, jobId))
    }
  }

  private upsertRenderStatusTxSync(
    tx: DrizzleDatabase,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    status: Partial<
      Pick<
        RenderStatus,
        'isRendered' | 'imagePath' | 'thumbnailPath' | 'width' | 'height' | 'fileSize'
      >
    >,
    now: string,
  ): void {
    const existingRows = this.buildRenderStatusSelect(tx, jobId, episodeNumber, pageNumber)
      .limit(1)
      .all() as RenderStatus[]

    const existing = existingRows[0]
    const wasRendered = existing?.isRendered ?? false

    if (existing) {
      tx.update(renderStatus)
        .set(this.createRenderStatusUpdate(status, existing, now))
        .where(eq(renderStatus.id, existing.id))
        .run()
    } else {
      tx.insert(renderStatus)
        .values(this.createRenderStatusInsert(jobId, episodeNumber, pageNumber, status, now))
        .run()
    }

    const isRenderedNow = status.isRendered ?? wasRendered
    if (isRenderedNow && !wasRendered) {
      const jobRows = this.buildJobSelect(tx, jobId).all() as Array<{
        renderedPages: number | null
        totalPages: number | null
      }>

      const jobRow = jobRows[0]
      const currentRenderedPages = jobRow?.renderedPages ?? 0
      const newRenderedPages = currentRenderedPages + 1

      tx.update(jobs)
        .set({ renderedPages: newRenderedPages, updatedAt: now })
        .where(eq(jobs.id, jobId))
        .run()

      this.completeJobIfNeededSync(tx, jobId, newRenderedPages, jobRow?.totalPages ?? 0, now)
    }
  }

  private async upsertRenderStatusTxAsync(
    tx: DrizzleDatabase,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    status: Partial<
      Pick<
        RenderStatus,
        'isRendered' | 'imagePath' | 'thumbnailPath' | 'width' | 'height' | 'fileSize'
      >
    >,
    now: string,
  ): Promise<void> {
    const existingRows = (await this.buildRenderStatusSelect(
      tx,
      jobId,
      episodeNumber,
      pageNumber,
    ).limit(1)) as RenderStatus[]

    const existing = existingRows[0]
    const wasRendered = existing?.isRendered ?? false

    if (existing) {
      await tx
        .update(renderStatus)
        .set(this.createRenderStatusUpdate(status, existing, now))
        .where(eq(renderStatus.id, existing.id))
    } else {
      await tx
        .insert(renderStatus)
        .values(this.createRenderStatusInsert(jobId, episodeNumber, pageNumber, status, now))
    }

    const isRenderedNow = status.isRendered ?? wasRendered
    if (isRenderedNow && !wasRendered) {
      const jobRows = (await this.buildJobSelect(tx, jobId)) as Array<{
        renderedPages: number | null
        totalPages: number | null
      }>

      const jobRow = jobRows[0]
      const currentRenderedPages = jobRow?.renderedPages ?? 0
      const newRenderedPages = currentRenderedPages + 1

      await tx
        .update(jobs)
        .set({ renderedPages: newRenderedPages, updatedAt: now })
        .where(eq(jobs.id, jobId))

      await this.completeJobIfNeededAsync(tx, jobId, newRenderedPages, jobRow?.totalPages ?? 0, now)
    }
  }

  /**
   * Get per-episode render progress
   */
  async getPerEpisodeRenderProgress(
    jobId: string,
  ): Promise<Record<number, { planned: number; rendered: number; total?: number }>> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      // Get rendered count per episode
      const renderRows = drizzleDb
        .select({
          episodeNumber: renderStatus.episodeNumber,
          rendered: sql<number>`sum(${renderStatus.isRendered})`,
        })
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .groupBy(renderStatus.episodeNumber)
        .all() as Array<{ episodeNumber: number; rendered: number | null }>

      const result: Record<number, { planned: number; rendered: number; total?: number }> = {}

      for (const row of renderRows) {
        const ep = Number(row.episodeNumber)
        const rendered = Math.max(0, Number(row.rendered || 0))
        result[ep] = {
          planned: rendered, // Default to rendered count if no layout info
          rendered,
        }
      }

      return result
    } else {
      // Get rendered count per episode
      const drizzleDb = this.db as DrizzleDatabase
      const renderRows = await drizzleDb
        .select({
          episodeNumber: renderStatus.episodeNumber,
          rendered: sql<number>`sum(${renderStatus.isRendered})`,
        })
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .groupBy(renderStatus.episodeNumber)

      const result: Record<number, { planned: number; rendered: number; total?: number }> = {}

      for (const row of renderRows) {
        const ep = Number(row.episodeNumber)
        const rendered = Math.max(0, Number(row.rendered || 0))
        result[ep] = {
          planned: rendered, // Default to rendered count if no layout info
          rendered,
        }
      }

      return result
    }
  }

  /**
   * Count rendered pages for a job
   */
  async countRenderedPagesByJob(jobId: string): Promise<number> {
    const rows = await this.getAllRenderStatusByJob(jobId)
    return rows.reduce((acc, r) => acc + (r.isRendered ? 1 : 0), 0)
  }

  /**
   * Delete render status records for a job
   */
  async deleteRenderStatusByJob(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(renderStatus).where(eq(renderStatus.jobId, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(renderStatus).where(eq(renderStatus.jobId, jobId))
      })
    }
  }
}
