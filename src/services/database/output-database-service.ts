import { desc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { NewOutput, Output } from '@/db/schema'
import { outputs } from '@/db/schema'
import { ensureCreatedAtString } from '@/utils/db'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Output-specific database operations
 * Follows Single Responsibility Principle
 */
export class OutputDatabaseService extends BaseDatabaseService {
  /**
   * Create a new output record
   */
  async createOutput(
    output: Omit<NewOutput, 'id' | 'createdAt'> & { id?: string },
  ): Promise<string> {
    const id = output.id ?? crypto.randomUUID()
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(outputs)
          .values({
            id,
            novelId: output.novelId,
            jobId: output.jobId,
            userId: output.userId,
            outputType: output.outputType,
            outputPath: output.outputPath,
            fileSize: output.fileSize,
            pageCount: output.pageCount,
            metadataPath: output.metadataPath,
            createdAt: now,
          })
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(outputs).values({
          id,
          novelId: output.novelId,
          jobId: output.jobId,
          userId: output.userId,
          outputType: output.outputType,
          outputPath: output.outputPath,
          fileSize: output.fileSize,
          pageCount: output.pageCount,
          metadataPath: output.metadataPath,
          createdAt: now,
        })
      })
    }

    return id
  }

  /**
   * Get an output by ID
   */
  async getOutput(id: string): Promise<Output | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      const rows = drizzleDb.select().from(outputs).where(eq(outputs.id, id)).limit(1).all() as Array<Record<string, unknown>>
      const r = rows[0]
      return (r ? ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) } as Output) : null)
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb.select().from(outputs).where(eq(outputs.id, id)).limit(1) as Array<Record<string, unknown>>
      const r = rows[0]
      return (r ? ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) } as Output) : null)
    }
  }

  /**
   * Get outputs by job ID
   */
  async getOutputsByJobId(jobId: string): Promise<Output[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = drizzleDb.select().from(outputs).where(eq(outputs.jobId, jobId)).all() as Array<Record<string, unknown>>
      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb.select().from(outputs).where(eq(outputs.jobId, jobId)) as Array<Record<string, unknown>>
      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
    }
  }

  /**
   * Get outputs by novel ID
   */
  async getOutputsByNovelId(novelId: string): Promise<Output[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = drizzleDb.select().from(outputs).where(eq(outputs.novelId, novelId)).all() as Array<Record<string, unknown>>
      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb.select().from(outputs).where(eq(outputs.novelId, novelId)) as Array<Record<string, unknown>>
      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
    }
  }

  /**
   * Get recent outputs by user ID
   */
  async getOutputsByUserId(userId: string, limit: number): Promise<Output[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = drizzleDb
        .select()
        .from(outputs)
        .where(eq(outputs.userId, userId))
        .orderBy(desc(outputs.createdAt))
        .limit(limit)
        .all() as Array<Record<string, unknown>>

      return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
    }

    const drizzleDb = this.db as DrizzleDatabase
    const rows = await drizzleDb
      .select()
      .from(outputs)
      .where(eq(outputs.userId, userId))
      .orderBy(desc(outputs.createdAt))
      .limit(limit) as Array<Record<string, unknown>>

    return rows.map((r) => ({ ...(r as Record<string, unknown>), createdAt: ensureCreatedAtString(r) })) as Output[]
  }

  /**
   * Update output metadata
   */
  async updateOutput(
    id: string,
    updates: Partial<Omit<Output, 'id' | 'createdAt'>>,
  ): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(outputs).set(updates).where(eq(outputs.id, id)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.update(outputs).set(updates).where(eq(outputs.id, id))
      })
    }
  }

  /**
   * Delete an output
   */
  async deleteOutput(id: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(outputs).where(eq(outputs.id, id)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(outputs).where(eq(outputs.id, id))
      })
    }
  }

  /**
   * Delete outputs by job ID
   */
  async deleteOutputsByJobId(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(outputs).where(eq(outputs.jobId, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(outputs).where(eq(outputs.jobId, jobId))
      })
    }
  }
}
