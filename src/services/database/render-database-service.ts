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
        const existing = tx
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
          .all() as RenderStatus[]

        const wasRendered = existing[0]?.isRendered ?? false

        if (existing[0]) {
          tx.update(renderStatus)
            .set({
              isRendered: status.isRendered ?? existing[0].isRendered,
              imagePath: status.imagePath ?? existing[0].imagePath,
              thumbnailPath: status.thumbnailPath ?? existing[0].thumbnailPath,
              width: status.width ?? existing[0].width,
              height: status.height ?? existing[0].height,
              fileSize: status.fileSize ?? existing[0].fileSize,
              renderedAt: now,
            })
            .where(eq(renderStatus.id, existing[0].id))
            .run()
        } else {
          tx.insert(renderStatus)
            .values({
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
            .run()
        }

        const isRenderedNow = status.isRendered ?? wasRendered
        if (isRenderedNow && !wasRendered) {
          const jobRow = tx
            .select({ renderedPages: jobs.renderedPages, totalPages: jobs.totalPages })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)
            .all()[0]

          const currentRenderedPages = jobRow?.renderedPages ?? 0
          const newRenderedPages = currentRenderedPages + 1
          tx.update(jobs)
            .set({ renderedPages: newRenderedPages, updatedAt: now })
            .where(eq(jobs.id, jobId))
            .run()

          const totalPages = jobRow?.totalPages ?? 0
          if (totalPages > 0 && newRenderedPages >= totalPages) {
            tx.update(jobs)
              .set({ renderCompleted: true, updatedAt: now })
              .where(eq(jobs.id, jobId))
              .run()
          }
        }
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        const existing = await tx
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

        const wasRendered = existing[0]?.isRendered ?? false

        if (existing[0]) {
          await tx
            .update(renderStatus)
            .set({
              isRendered: status.isRendered ?? existing[0].isRendered,
              imagePath: status.imagePath ?? existing[0].imagePath,
              thumbnailPath: status.thumbnailPath ?? existing[0].thumbnailPath,
              width: status.width ?? existing[0].width,
              height: status.height ?? existing[0].height,
              fileSize: status.fileSize ?? existing[0].fileSize,
              renderedAt: now,
            })
            .where(eq(renderStatus.id, existing[0].id))
        } else {
          await tx.insert(renderStatus).values({
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
        }

        const isRenderedNow = status.isRendered ?? wasRendered
        if (isRenderedNow && !wasRendered) {
          const jobRow = await tx
            .select({ renderedPages: jobs.renderedPages, totalPages: jobs.totalPages })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)

          const currentRenderedPages = jobRow[0]?.renderedPages ?? 0
          const newRenderedPages = currentRenderedPages + 1
          await tx
            .update(jobs)
            .set({ renderedPages: newRenderedPages, updatedAt: now })
            .where(eq(jobs.id, jobId))

          const totalPages = jobRow[0]?.totalPages ?? 0
          if (totalPages > 0 && newRenderedPages >= totalPages) {
            await tx
              .update(jobs)
              .set({ renderCompleted: true, updatedAt: now })
              .where(eq(jobs.id, jobId))
          }
        }
      })
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
