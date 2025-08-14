/**
 * 統合テスト用データベースヘルパー
 * テスト用インメモリSQLiteデータベースを提供
 */

import fs from 'node:fs'
import path from 'node:path'
import { Database } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/db/schema'
import { DatabaseService } from '@/services/database'

export interface TestDatabase {
  db: ReturnType<typeof drizzle>
  service: DatabaseService
  cleanup: () => void
}

/**
 * テスト用インメモリデータベースを作成
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  // インメモリSQLiteデータベースを作成
  const Database = (await import('better-sqlite3')).default
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

  // マイグレーションを実行
  const migrationsPath = path.join(process.cwd(), 'drizzle')
  if (fs.existsSync(migrationsPath)) {
    try {
      migrate(db, { migrationsFolder: migrationsPath })
    } catch (error) {
      console.warn('Migration warning (expected in tests):', error)
    }
  }

  const service = new DatabaseService(db)

  return {
    db,
    service,
    cleanup: () => {
      try {
        sqlite.close()
      } catch (error) {
        // SQLiteが既に閉じられている場合は無視
        console.warn('Database cleanup warning:', error)
      }
    },
  }
}

/**
 * テスト用データベースのクリーンアップ
 */
export async function cleanupTestDatabase(testDb: TestDatabase): Promise<void> {
  try {
    // 全テーブルをクリア（外部キー制約を考慮した順序）
    await testDb.db.delete(schema.episodeBoundaries)
    await testDb.db.delete(schema.episodes)
    await testDb.db.delete(schema.chunks)
    await testDb.db.delete(schema.jobs)
    await testDb.db.delete(schema.novels)
  } catch (error) {
    console.warn('Database cleanup warning:', error)
  } finally {
    testDb.cleanup()
  }
}

/**
 * テスト用データファクトリー
 */
export class TestDataFactory {
  constructor(private db: ReturnType<typeof drizzle>) {}

  async createNovel(overrides: Partial<typeof schema.novels.$inferInsert> = {}) {
    const novel = {
      id: `test-novel-${Date.now()}`,
      title: 'Test Novel',
      textLength: 1000,
      language: 'ja' as const,
      ...overrides,
    }

    await this.db.insert(schema.novels).values(novel)
    return novel
  }

  async createJob(overrides: Partial<typeof schema.jobs.$inferInsert> = {}) {
    const job = {
      id: `test-job-${Date.now()}`,
      novelId: overrides.novelId || 'test-novel-default',
      status: 'processing' as const,
      currentStep: 'initialized' as const,
      ...overrides,
    }

    await this.db.insert(schema.jobs).values(job)
    return job
  }

  async createChunk(overrides: Partial<typeof schema.chunks.$inferInsert> = {}) {
    const chunk = {
      id: `test-chunk-${Date.now()}`,
      jobId: overrides.jobId || 'test-job-default',
      chunkIndex: 0,
      text: 'Test chunk text',
      wordCount: 100,
      ...overrides,
    }

    await this.db.insert(schema.chunks).values(chunk)
    return chunk
  }

  async createEpisode(overrides: Partial<typeof schema.episodes.$inferInsert> = {}) {
    const episode = {
      id: `test-episode-${Date.now()}`,
      jobId: overrides.jobId || 'test-job-default',
      episodeNumber: 1,
      title: 'Test Episode',
      summary: 'Test episode summary',
      startChunkIndex: 0,
      endChunkIndex: 1,
      pageCount: 5,
      ...overrides,
    }

    await this.db.insert(schema.episodes).values(episode)
    return episode
  }
}