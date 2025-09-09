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

    // Use Drizzle/better-sqlite3 synchronous transaction
    this.executeInTransactionSync((tx) => {
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

    this.executeInTransactionSync((tx) => {
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
  }

  /**
   * Get a novel by ID
   */
  async getNovel(id: string, userId?: string): Promise<Novel | null> {
    const conditions: SQL[] = [eq(novels.id, id)]
    if (userId) conditions.push(eq(novels.userId, userId))

    const drizzleDb = this.db as DrizzleDatabase
    const rows = drizzleDb
      .select()
      .from(novels)
      .where(and(...conditions))
      .limit(1)
      .all()
    return (rows[0] as Novel | undefined) ?? null
  }

  /**
   * Get all novels
   */
  async getAllNovels(userId?: string): Promise<Novel[]> {
    const drizzleDb = this.db as DrizzleDatabase
    if (userId) {
      return drizzleDb
        .select()
        .from(novels)
        .where(eq(novels.userId, userId))
        .orderBy(desc(novels.createdAt))
        .all() as Novel[]
    }
    return drizzleDb.select().from(novels).orderBy(desc(novels.createdAt)).all() as Novel[]
  }

  /**
   * Update novel metadata
   */
  async updateNovel(id: string, updates: Partial<Omit<Novel, 'id' | 'createdAt'>>): Promise<void> {
    this.executeInTransactionSync((tx) => {
      tx.update(novels)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(novels.id, id))
        .run()
    })
  }

  /**
   * Delete a novel
   */
  async deleteNovel(id: string): Promise<void> {
    this.executeInTransactionSync((tx) => {
      tx.delete(novels).where(eq(novels.id, id)).run()
    })
  }
}
