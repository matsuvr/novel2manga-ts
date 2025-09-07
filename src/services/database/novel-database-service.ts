import type { D1Database } from '@cloudflare/workers-types'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { NewNovel, Novel } from '@/db/schema'
import { novels } from '@/db/schema'
import { isD1Like } from '@/infrastructure/database/adapters/d1-adapter'
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
      // Async implementation (Cloudflare D1)
      await this.adapter.transaction(async (tx: unknown) => {
        if (!isD1Like(tx)) {
          throw new Error('Async adapter provided non-D1 transaction context')
        }
        const d1 = tx as D1Database
        const stmt = d1.prepare(
          `INSERT INTO novels (
            id, user_id, title, author, original_text_path, text_length, language, metadata_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        await stmt
          .bind(
            id,
            novel.userId ?? 'anonymous',
            novel.title ?? null,
            novel.author ?? null,
            novel.originalTextPath ?? null,
            novel.textLength,
            novel.language ?? 'ja',
            novel.metadataPath ?? null,
            now,
            now,
          )
          .run()
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
      // Async (D1): upsertは INSERT OR IGNORE でPK衝突を無視
      await this.adapter.transaction(async (tx: unknown) => {
        if (!isD1Like(tx)) {
          throw new Error('Async adapter provided non-D1 transaction context')
        }
        const d1 = tx as D1Database
        const stmt = d1.prepare(
          `INSERT OR IGNORE INTO novels (
            id, user_id, title, author, original_text_path, text_length, language, metadata_path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        await stmt
          .bind(
            id,
            novel.userId ?? 'anonymous',
            novel.title ?? null,
            novel.author ?? null,
            novel.originalTextPath ?? null,
            novel.textLength,
            novel.language ?? 'ja',
            novel.metadataPath ?? null,
            now,
            now,
          )
          .run()
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
      // Async (D1)
      const d1 = this.getDatabase() as unknown
      if (!isD1Like(d1)) {
        throw new Error('Async adapter requires D1 binding')
      }
      const where = userId ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ?'
      const stmt = (d1 as D1Database).prepare(
        `SELECT id, user_id as userId, title, author, original_text_path as originalTextPath,
                text_length as textLength, language, metadata_path as metadataPath,
                created_at as createdAt, updated_at as updatedAt
         FROM novels ${where} LIMIT 1`,
      )
      const res = userId
        ? await stmt.bind(id, userId).first<Novel>()
        : await stmt.bind(id).first<Novel>()
      return (res as Novel | undefined) ?? null
    }
  }

  /**
   * Get all novels
   */
  async getAllNovels(userId?: string): Promise<Novel[]> {
    if (this.isSync()) {
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
    } else {
      // Async (D1)
      const d1 = this.getDatabase() as unknown
      if (!isD1Like(d1)) {
        throw new Error('Async adapter requires D1 binding')
      }
      const stmt = userId
        ? (d1 as D1Database)
            .prepare(
              `SELECT id, user_id as userId, title, author, original_text_path as originalTextPath,
                    text_length as textLength, language, metadata_path as metadataPath,
                    created_at as createdAt, updated_at as updatedAt
             FROM novels WHERE user_id = ? ORDER BY created_at DESC`,
            )
            .bind(userId)
        : (d1 as D1Database).prepare(
            `SELECT id, user_id as userId, title, author, original_text_path as originalTextPath,
                    text_length as textLength, language, metadata_path as metadataPath,
                    created_at as createdAt, updated_at as updatedAt
             FROM novels ORDER BY created_at DESC`,
          )
      const res = await stmt.all<Novel>()
      return (res.results ?? []) as unknown as Novel[]
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
      await this.adapter.transaction(async (tx: unknown) => {
        if (!isD1Like(tx)) {
          throw new Error('Async adapter provided non-D1 transaction context')
        }
        const d1 = tx as D1Database
        const updatedAt = new Date().toISOString()

        // 動的SET句を構築（null許容フィールドはそのままバインド）
        const setClauses: string[] = []
        const params: unknown[] = []

        const m = updates as Partial<Novel>
        if (m.title !== undefined) {
          setClauses.push('title = ?')
          params.push(m.title)
        }
        if (m.author !== undefined) {
          setClauses.push('author = ?')
          params.push(m.author)
        }
        if (m.originalTextPath !== undefined) {
          setClauses.push('original_text_path = ?')
          params.push(m.originalTextPath)
        }
        if (m.textLength !== undefined) {
          setClauses.push('text_length = ?')
          params.push(m.textLength)
        }
        if (m.language !== undefined) {
          setClauses.push('language = ?')
          params.push(m.language)
        }
        if (m.metadataPath !== undefined) {
          setClauses.push('metadata_path = ?')
          params.push(m.metadataPath)
        }
        if (m.userId !== undefined) {
          setClauses.push('user_id = ?')
          params.push(m.userId)
        }

        // 常に updated_at を更新
        setClauses.push('updated_at = ?')
        params.push(updatedAt)

        if (setClauses.length === 0) return

        const sql = `UPDATE novels SET ${setClauses.join(', ')} WHERE id = ?`
        const stmt = d1.prepare(sql)
        await stmt.bind(...params, id).run()
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
      await this.adapter.transaction(async (tx: unknown) => {
        if (!isD1Like(tx)) {
          throw new Error('Async adapter provided non-D1 transaction context')
        }
        const d1 = tx as D1Database
        await d1.prepare('DELETE FROM novels WHERE id = ?').bind(id).run()
      })
    }
  }
}
