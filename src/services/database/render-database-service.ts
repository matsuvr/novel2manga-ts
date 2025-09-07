import { and, desc, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { RenderStatus } from '@/db/schema'
import { jobs, renderStatus } from '@/db/schema'
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
      return (rows[0] as RenderStatus | undefined) ?? null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await this.buildRenderStatusSelect(
        drizzleDb,
        jobId,
        episodeNumber,
        pageNumber,
      ).limit(1)
      return (rows[0] as RenderStatus | undefined) ?? null
    }
  }

  /**
   * Get all render status records for a job
   */
  async getAllRenderStatusByJob(jobId: string): Promise<RenderStatus[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb
        .select()
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .orderBy(desc(renderStatus.renderedAt))
        .all() as RenderStatus[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(renderStatus)
        .where(eq(renderStatus.jobId, jobId))
        .orderBy(desc(renderStatus.renderedAt))

      return rows as RenderStatus[]
    }
  }

  /**
   * Get render status for a specific episode
   */
  async getRenderStatusByEpisode(jobId: string, episodeNumber: number): Promise<RenderStatus[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb
        .select()
        .from(renderStatus)
        .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
        .orderBy(renderStatus.pageNumber)
        .all() as RenderStatus[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(renderStatus)
        .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
        .orderBy(renderStatus.pageNumber)

      return rows as RenderStatus[]
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
        void this.upsertRenderStatusTx(tx, jobId, episodeNumber, pageNumber, status, now)
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await this.upsertRenderStatusTx(tx, jobId, episodeNumber, pageNumber, status, now)
      })
    }
  }

  private completeJobIfNeeded(
    tx: DrizzleDatabase,
    jobId: string,
    newRenderedPages: number,
    totalPages: number,
    now: string,
  ): Promise<void> | void {
    if (totalPages > 0 && newRenderedPages >= totalPages) {
      const query = tx
        .update(jobs)
        .set({ renderCompleted: true, updatedAt: now })
        .where(eq(jobs.id, jobId))
      if (this.isSync()) {
        query.run()
      } else {
        return query
      }
    }
    return undefined
  }

  private async upsertRenderStatusTx(
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
    const existingRows = this.isSync()
      ? (tx
          .select()
          .from(renderStatus)
          .where(
            and(
              eq(renderStatus.jobId, jobId),
              eq(renderStatus.episodeNumber, episodeNumber),
              eq(renderStatus.pageNumber, pageNumber),
            ),
          )
          .limit(1)
          .all() as RenderStatus[])
      : ((await tx
          .select()
          .from(renderStatus)
          .where(
            and(
              eq(renderStatus.jobId, jobId),
              eq(renderStatus.episodeNumber, episodeNumber),
              eq(renderStatus.pageNumber, pageNumber),
            ),
          )
          .limit(1)) as RenderStatus[])

    const existing = existingRows[0]
    const wasRendered = existing?.isRendered ?? false

    if (existing) {
      const query = tx
        .update(renderStatus)
        .set({
          isRendered: status.isRendered ?? existing.isRendered,
          imagePath: status.imagePath ?? existing.imagePath,
          thumbnailPath: status.thumbnailPath ?? existing.thumbnailPath,
          width: status.width ?? existing.width,
          height: status.height ?? existing.height,
          fileSize: status.fileSize ?? existing.fileSize,
          renderedAt: now,
        })
        .where(eq(renderStatus.id, existing.id))
      if (this.isSync()) {
        query.run()
      } else {
        await query
      }
    } else {
      const query = tx.insert(renderStatus).values({
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
      })
      if (this.isSync()) {
        query.run()
      } else {
        await query
      }
    }

    const isRenderedNow = status.isRendered ?? wasRendered
    if (isRenderedNow && !wasRendered) {
      const jobRows = this.isSync()
        ? (tx
            .select({ renderedPages: jobs.renderedPages, totalPages: jobs.totalPages })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)
            .all() as Array<{ renderedPages: number | null; totalPages: number | null }>)
        : ((await tx
            .select({ renderedPages: jobs.renderedPages, totalPages: jobs.totalPages })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)) as Array<{ renderedPages: number | null; totalPages: number | null }>)

      const jobRow = jobRows[0]
      const currentRenderedPages = jobRow?.renderedPages ?? 0
      const newRenderedPages = currentRenderedPages + 1

      const updateQuery = tx
        .update(jobs)
        .set({ renderedPages: newRenderedPages, updatedAt: now })
        .where(eq(jobs.id, jobId))
      if (this.isSync()) {
        updateQuery.run()
      } else {
        await updateQuery
      }

      await this.completeJobIfNeeded(
        tx,
        jobId,
        newRenderedPages,
        jobRow?.totalPages ?? 0,
        now,
      )
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
