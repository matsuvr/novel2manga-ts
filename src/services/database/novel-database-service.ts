import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { NewNovel, Novel } from '@/db/schema'
import { novels } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Novel-specific database operations
 * Follows Single Responsibility Principle
 */
export class NovelDatabaseService extends BaseDatabaseService {
  /**
   * Create a new novel
   */
  async createNovel(
    novel: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Novel> {
    const id = novel.id ?? crypto.randomUUID()
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(novels)
          .values({
            id,
            userId: novel.userId ?? 'anonymous',
            title: novel.title,
            author: novel.author,
            originalTextPath: novel.originalTextPath,
            textLength: novel.textLength,
            language: novel.language ?? 'ja',
            metadataPath: novel.metadataPath,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      })
    } else {
      // Async implementation
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(novels).values({
          id,
          userId: novel.userId ?? 'anonymous',
          title: novel.title,
          author: novel.author,
          originalTextPath: novel.originalTextPath,
          textLength: novel.textLength,
          language: novel.language ?? 'ja',
          metadataPath: novel.metadataPath,
          createdAt: now,
          updatedAt: now,
        })
      })
    }

    return {
      id,
      userId: novel.userId ?? 'anonymous',
      title: novel.title,
      author: novel.author,
      originalTextPath: novel.originalTextPath,
      textLength: novel.textLength,
      language: novel.language ?? 'ja',
      metadataPath: novel.metadataPath,
      createdAt: now,
      updatedAt: now,
    } as Novel
  }

  /**
   * Ensure a novel exists (upsert)
   */
  async ensureNovel(
    id: string,
    novel: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(novels)
          .values({
            id,
            userId: novel.userId ?? 'anonymous',
            title: novel.title,
            author: novel.author,
            originalTextPath: novel.originalTextPath,
            textLength: novel.textLength,
            language: novel.language ?? 'ja',
            metadataPath: novel.metadataPath,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .insert(novels)
          .values({
            id,
            userId: novel.userId ?? 'anonymous',
            title: novel.title,
            author: novel.author,
            originalTextPath: novel.originalTextPath,
            textLength: novel.textLength,
            language: novel.language ?? 'ja',
            metadataPath: novel.metadataPath,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
      })
    }
  }

  /**
   * Get a novel by ID
   */
  async getNovel(id: string, userId?: string): Promise<Novel | null> {
    const conditions: SQL[] = [eq(novels.id, id)]
    if (userId) conditions.push(eq(novels.userId, userId))

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = drizzleDb
        .select()
        .from(novels)
        .where(and(...conditions))
        .limit(1)
        .all()
      return (rows[0] as Novel | undefined) ?? null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const rows = await drizzleDb
        .select()
        .from(novels)
        .where(and(...conditions))
        .limit(1)
      return (rows[0] as Novel | undefined) ?? null
    }
  }

  /**
   * Get all novels
   */
  async getAllNovels(userId?: string): Promise<Novel[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const q = drizzleDb.select().from(novels)

      if (userId) {
        // drizzle's builder mutates internally; keep fluent
        ;(q as unknown as { where: (expr: SQL) => void }).where(eq(novels.userId, userId))
      }

      return q.orderBy(desc(novels.createdAt)).all() as unknown[] as Novel[]
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const base = drizzleDb.select().from(novels)
      const rows = userId
        ? await base.where(eq(novels.userId, userId)).orderBy(desc(novels.createdAt))
        : await base.orderBy(desc(novels.createdAt))
      return rows as Novel[]
    }
  }

  /**
   * Update novel metadata
   */
  async updateNovel(id: string, updates: Partial<Omit<Novel, 'id' | 'createdAt'>>): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(novels)
          .set({
            ...updates,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(novels.id, id))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(novels)
          .set({
            ...updates,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(novels.id, id))
      })
    }
  }

  /**
   * Delete a novel
   */
  async deleteNovel(id: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.delete(novels).where(eq(novels.id, id)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(novels).where(eq(novels.id, id))
      })
    }
  }
}
