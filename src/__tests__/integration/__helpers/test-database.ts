/**
 * 統合テスト用データベースヘルパー
 * テスト用インメモリSQLiteデータベースを提供
 */

import fs from "node:fs";
import path from "node:path";
import { Database } from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { DatabaseService } from "@/services/database";

export interface TestDatabase {
  db: ReturnType<typeof drizzle>;
  service: DatabaseService;
  cleanup: () => void;
}

/**
 * テスト用インメモリデータベースを作成
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  // インメモリSQLiteデータベースを作成
  const Database = (await import("better-sqlite3")).default;
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // マイグレーションを実行
  const migrationsPath = path.join(process.cwd(), "drizzle");
  if (fs.existsSync(migrationsPath)) {
    try {
      migrate(db, { migrationsFolder: migrationsPath });
    } catch (error) {
      console.warn("Migration warning (expected in tests):", error);
    }
  }

  // Drizzle(better-sqlite3) を直接叩く軽量サービス実装（テスト専用）
  const service: any = {
    async createNovel(novel: any) {
      const id = novel.id || `test-novel-${Date.now()}`;
      await db.insert(schema.novels).values({
        id,
        title: novel.title ?? "Test Novel",
        author: novel.author ?? "Unknown",
        originalTextPath: novel.originalTextPath ?? `${id}.json`,
        textLength: novel.textLength ?? 0,
        language: novel.language ?? "ja",
        metadataPath: novel.metadataPath ?? null,
      });
      return id;
    },
    async ensureNovel(id: string, novel: any) {
      try {
        await db.insert(schema.novels).values({
          id,
          title: novel.title ?? "Test Novel",
          author: novel.author ?? "Unknown",
          originalTextPath: novel.originalTextPath ?? `${id}.json`,
          textLength: novel.textLength ?? 0,
          language: novel.language ?? "ja",
          metadataPath: novel.metadataPath ?? null,
        });
      } catch {}
    },
    async getNovel(id: string) {
      const rows = await db.select().from(schema.novels).where(eq(schema.novels.id, id)).limit(1);
      return rows[0] || null;
    },
    async createJob(payload: any) {
      const id = payload.id || `test-job-${Date.now()}`;
      await db.insert(schema.jobs).values({
        id,
        novelId: payload.novelId,
        jobName: payload.title ?? null,
        status: (payload.status as any) || "pending",
        currentStep: "split",
        totalChunks: payload.totalChunks || 0,
      });
      return id;
    },
    async updateJobStatus(id: string, status: any) {
      await db.update(schema.jobs).set({ status }).where(eq(schema.jobs.id, id));
    },
    async updateJobStep(id: string, currentStep: string, processedChunks?: number, totalChunks?: number) {
      const update: any = { currentStep };
      if (processedChunks !== undefined) update.processedChunks = processedChunks;
      if (totalChunks !== undefined) update.totalChunks = totalChunks;
      await db.update(schema.jobs).set(update).where(eq(schema.jobs.id, id));
    },
    async markJobStepCompleted(id: string, step: string) {
      const update: any = {};
      if (step === "split") update.splitCompleted = 1;
      if (step === "analyze") update.analyzeCompleted = 1;
      if (step === "episode") update.episodeCompleted = 1;
      if (step === "layout") update.layoutCompleted = 1;
      if (step === "render") update.renderCompleted = 1;
      await db.update(schema.jobs).set(update).where(eq(schema.jobs.id, id));
    },
    async createChunk(chunk: any) {
      const id = `test-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await db.insert(schema.chunks).values({
        id,
        novelId: chunk.novelId,
        jobId: chunk.jobId,
        chunkIndex: chunk.chunkIndex,
        contentPath: chunk.contentPath ?? `${chunk.jobId}/chunks/${chunk.chunkIndex}.txt`,
        startPosition: chunk.startPosition ?? 0,
        endPosition: chunk.endPosition ?? (chunk.startPosition ?? 0) + (chunk.wordCount ?? 0),
        wordCount: chunk.wordCount ?? 0,
      });
      return id;
    },
    async createChunksBatch(payloads: any[]) {
      for (const c of payloads) {
        // eslint-disable-next-line no-await-in-loop
        await service.createChunk(c);
      }
    },
    async getChunksByJobId(jobId: string) {
      return await db
        .select()
        .from(schema.chunks)
        .where(eq(schema.chunks.jobId, jobId))
        .orderBy(schema.chunks.chunkIndex);
    },
    async getJob(id: string) {
      const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
      return rows[0] || null;
    },
    async getJobWithProgress(id: string) {
      const job = await service.getJob(id);
      if (!job) return null;
      return { ...job, progress: { currentStep: job.currentStep, processedChunks: job.processedChunks ?? 0, totalChunks: job.totalChunks ?? 0, episodes: [] } };
    },
    async getJobsByNovelId(novelId: string) {
      return await db.select().from(schema.jobs).where(eq(schema.jobs.novelId, novelId));
    },
    async getEpisodesByJobId(jobId: string) {
      return await db
        .select()
        .from(schema.episodes)
        .where(eq(schema.episodes.jobId, jobId))
        .orderBy(schema.episodes.episodeNumber);
    },
    async deleteJob(id: string) {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, id));
    },
  };

  return {
    db,
    service,
    cleanup: () => {
      try {
        sqlite.close();
      } catch (error) {
        // SQLiteが既に閉じられている場合は無視
        console.warn("Database cleanup warning:", error);
      }
    },
  };
}

/**
 * テスト用データベースのクリーンアップ
 */
export async function cleanupTestDatabase(testDb: TestDatabase): Promise<void> {
  try {
    // 全テーブルをクリア（外部キー制約を考慮した順序）
    try {
      await testDb.db.delete(schema.episodeBoundaries);
    } catch {}
    try {
      await testDb.db.delete(schema.episodes);
    } catch {}
    try {
      await testDb.db.delete(schema.chunks);
    } catch {}
    try {
      await testDb.db.delete(schema.jobs);
    } catch {}
    try {
      await testDb.db.delete(schema.novels);
    } catch {}
  } catch (error) {
    console.warn("Database cleanup warning:", error);
  } finally {
    testDb?.cleanup?.();
  }
}

/**
 * テスト用データファクトリー
 */
export class TestDataFactory {
  constructor(private db: ReturnType<typeof drizzle>) {}

  async createNovel(
    overrides: Partial<typeof schema.novels.$inferInsert> = {}
  ) {
    const id = overrides.id || `test-novel-${Date.now()}`;
    const novel = {
      id,
      title: "Test Novel",
      textLength: 1000,
      language: "ja" as const,
      originalTextPath: overrides.originalTextPath || `${id}.json`,
      ...overrides,
    };

    await this.db.insert(schema.novels).values(novel);
    return novel;
  }

  async createJob(overrides: Partial<typeof schema.jobs.$inferInsert> = {}) {
    const job = {
      id: `test-job-${Date.now()}`,
      novelId: overrides.novelId || "test-novel-default",
      status: "processing" as const,
      currentStep: "initialized" as const,
      ...overrides,
    };

    await this.db.insert(schema.jobs).values(job);
    return job;
  }

  async createChunk(
    overrides: Partial<typeof schema.chunks.$inferInsert> = {}
  ) {
    const jobId = (overrides as any).jobId || "test-job-default";
    const chunkIndex = (overrides as any).chunkIndex ?? 0;
    const text = (overrides as any).text ?? "Test chunk text";
    const startPosition = (overrides as any).startPosition ?? 0;
    const endPosition =
      (overrides as any).endPosition ?? startPosition + String(text).length;
    const contentPath =
      (overrides as any).contentPath ?? `${jobId}/chunks/${chunkIndex}.txt`;

    const chunk = {
      id: `test-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // novelId が未指定の場合は、ジョブに紐づく novelId を引いて解決する
      novelId:
        (overrides as any).novelId ||
        (await (async () => {
          const jobRows = await this.db
            .select()
            .from(schema.jobs)
            .where(eq(schema.jobs.id, jobId))
            .limit(1);
          return (jobRows?.[0] as any)?.novelId || "test-novel-default";
        })()),
      jobId,
      chunkIndex,
      contentPath,
      startPosition,
      endPosition,
      wordCount: (overrides as any).wordCount ?? String(text).length,
    };

    await this.db.insert(schema.chunks).values(chunk);
    return chunk as any;
  }

  async createEpisode(
    overrides: Partial<typeof schema.episodes.$inferInsert> = {}
  ) {
    const episode = {
      id: `test-episode-${Date.now()}`,
      jobId: overrides.jobId || "test-job-default",
      episodeNumber: 1,
      title: "Test Episode",
      summary: "Test episode summary",
      startChunkIndex: 0,
      endChunkIndex: 1,
      pageCount: 5,
      ...overrides,
    };

    await this.db.insert(schema.episodes).values(episode);
    return episode;
  }
}
