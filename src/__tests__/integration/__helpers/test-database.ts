/**
 * 統合テスト用データベースヘルパー
 * テスト用インメモリSQLiteデータベースを提供
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
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
  const db = drizzle(sqlite);

  // マイグレーションを実行
  const migrationsPath = path.join(process.cwd(), "drizzle");
  if (fs.existsSync(migrationsPath)) {
    try {
      migrate(db, { migrationsFolder: migrationsPath });
    } catch (error) {
      console.warn("Migration warning (expected in tests):", error);
    }
  }

  // 簡易実装のサービス（本番 DatabaseService の必要部分のみを再現）
  const service = {
    async createNovel(
      novel: Omit<schema.NewNovel, "id" | "createdAt" | "updatedAt">
    ): Promise<string> {
      const id = `test-novel-${Date.now()}`;
      await db.insert(schema.novels).values({
        id,
        title: novel.title,
        author: (novel as any).author,
        originalTextPath: (novel as any).originalTextPath,
        textLength: novel.textLength,
        language: (novel as any).language || "ja",
        metadataPath: (novel as any).metadataPath,
      });
      return id;
    },
    async ensureNovel(
      id: string,
      novel: Omit<schema.NewNovel, "id" | "createdAt" | "updatedAt">
    ): Promise<void> {
      await db
        .insert(schema.novels)
        .values({
          id,
          title: novel.title,
          author: (novel as any).author,
          originalTextPath: (novel as any).originalTextPath,
          textLength: novel.textLength,
          language: (novel as any).language || "ja",
          metadataPath: (novel as any).metadataPath,
        })
        .onConflictDoNothing();
    },
    async getNovel(id: string) {
      const rows = await db
        .select()
        .from(schema.novels)
        .where(eq(schema.novels.id, id))
        .limit(1);
      return rows[0] || null;
    },
    async createJob(payload: {
      id?: string;
      novelId: string;
      title?: string;
      totalChunks?: number;
      status?: string;
    }) {
      const id = payload.id || `test-job-${Date.now()}`;
      await db.insert(schema.jobs).values({
        id,
        novelId: payload.novelId,
        jobName: payload.title,
        status: (payload.status as any) || "processing",
        currentStep: "initialized",
        totalChunks: payload.totalChunks || 0,
      });
      return id;
    },
    async updateJobStep(
      id: string,
      step: any,
      processed?: number,
      total?: number,
      error?: string,
      errorStep?: string
    ) {
      const updateData: Partial<schema.Job> = {
        processedChunks: processed,
        totalChunks: total,
        lastError: error,
        lastErrorStep: errorStep,
        currentStep: step as any,
      } as any;
      await db
        .update(schema.jobs)
        .set(updateData)
        .where(eq(schema.jobs.id, id));
    },
    async markJobStepCompleted(id: string, step: any) {
      const updateData: Record<string, any> = {};
      switch (step) {
        case "split":
          updateData.splitCompleted = true;
          break;
        case "analyze":
          updateData.analyzeCompleted = true;
          break;
        case "episode":
          updateData.episodeCompleted = true;
          break;
        case "layout":
          updateData.layoutCompleted = true;
          break;
        case "render":
          updateData.renderCompleted = true;
          break;
      }
      await db
        .update(schema.jobs)
        .set(updateData)
        .where(eq(schema.jobs.id, id));
    },
    async updateJobStatus(id: string, status: any) {
      await db
        .update(schema.jobs)
        .set({ status })
        .where(eq(schema.jobs.id, id));
    },
    async getJob(id: string) {
      const rows = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, id))
        .limit(1);
      return rows[0] || null;
    },
    async getJobWithProgress(id: string) {
      const rows = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, id))
        .limit(1);
      const job = rows[0];
      if (!job) return null;
      return {
        ...job,
        progress: {
          currentStep: (job as any).currentStep || "initialized",
          processedChunks: (job as any).processedChunks || 0,
          totalChunks: (job as any).totalChunks || 0,
          episodes: [],
        },
      };
    },
    async createChunk(
      chunk: Omit<schema.NewChunk, "id" | "createdAt">
    ): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(schema.chunks).values({ id, ...chunk });
      return id;
    },
    async createChunksBatch(payloads: any[]) {
      for (const p of payloads) {
        await db
          .insert(schema.chunks)
          .values({ id: crypto.randomUUID(), ...(p as any) });
      }
    },
    async getChunksByJobId(jobId: string) {
      return await db
        .select()
        .from(schema.chunks)
        .where(eq(schema.chunks.jobId, jobId))
        .orderBy(asc(schema.chunks.chunkIndex));
    },
    async getChunks(jobId: string) {
      const rows = await db
        .select()
        .from(schema.chunks)
        .where(eq(schema.chunks.jobId, jobId))
        .orderBy(asc(schema.chunks.chunkIndex));
      return rows.map((r: any) => ({
        chunkIndex: r.chunkIndex,
        text: (r as any).text,
      }));
    },
  } as unknown as DatabaseService;

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
    await testDb.db.delete(schema.episodes);
    await testDb.db.delete(schema.chunks);
    await testDb.db.delete(schema.chunkAnalysisStatus);
    await testDb.db.delete(schema.layoutStatus);
    await testDb.db.delete(schema.renderStatus);
    await testDb.db.delete(schema.outputs);
    await testDb.db.delete(schema.storageFiles);
    await testDb.db.delete(schema.jobStepHistory);
    await testDb.db.delete(schema.jobs);
    await testDb.db.delete(schema.novels);
  } catch (error) {
    console.warn("Database cleanup warning:", error);
  } finally {
    testDb.cleanup();
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
    const novel = {
      id: `test-novel-${Date.now()}`,
      title: "Test Novel",
      textLength: 1000,
      language: "ja" as const,
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
    // スキーマ必須項目に合わせてデフォルト値を用意
    const nowId = `test-chunk-${Date.now()}`;
    const novelId = (overrides as any).novelId || "test-novel-default";
    const jobId = (overrides as any).jobId || "test-job-default";
    const chunkIndex = overrides.chunkIndex ?? 0;
    const contentPath =
      (overrides as any).contentPath ?? `${jobId}/chunks/${chunkIndex}.txt`;
    const startPosition = (overrides as any).startPosition ?? 0;
    const endPosition = (overrides as any).endPosition ?? 100;
    const wordCount = overrides.wordCount ?? 100;

    // スキーマに存在しないキー（例: text）は含めない
    const chunk: typeof schema.chunks.$inferInsert = {
      id: nowId,
      novelId,
      jobId,
      chunkIndex,
      contentPath,
      startPosition,
      endPosition,
      wordCount,
      // createdAt はDBデフォルト
    };

    // 指定があれば上書き（スキーマキーのみ適用）
    const allowedKeys = new Set<keyof typeof chunk>([
      "id",
      "novelId",
      "jobId",
      "chunkIndex",
      "contentPath",
      "startPosition",
      "endPosition",
      "wordCount",
      "createdAt",
    ]);

    for (const [k, v] of Object.entries(overrides)) {
      if (allowedKeys.has(k as keyof typeof chunk)) {
        (chunk as any)[k] = v;
      }
    }

    await this.db.insert(schema.chunks).values(chunk);
    return chunk;
  }

  async createEpisode(
    overrides: Partial<typeof schema.episodes.$inferInsert> = {}
  ) {
    const nowId = `test-episode-${Date.now()}`;
    const novelId = (overrides as any).novelId || "test-novel-default";
    const jobId = (overrides as any).jobId || "test-job-default";

    const episode: typeof schema.episodes.$inferInsert = {
      id: nowId,
      novelId,
      jobId,
      episodeNumber: overrides.episodeNumber ?? 1,
      title: (overrides as any).title ?? "Test Episode",
      summary: (overrides as any).summary ?? "Test episode summary",
      startChunk: (overrides as any).startChunk ?? 0,
      startCharIndex: (overrides as any).startCharIndex ?? 0,
      endChunk: (overrides as any).endChunk ?? 1,
      endCharIndex: (overrides as any).endCharIndex ?? 100,
      estimatedPages: (overrides as any).estimatedPages ?? 5,
      confidence: (overrides as any).confidence ?? 0.9,
      // createdAt はDBデフォルト
    };

    const allowedKeys = new Set<keyof typeof episode>([
      "id",
      "novelId",
      "jobId",
      "episodeNumber",
      "title",
      "summary",
      "startChunk",
      "startCharIndex",
      "endChunk",
      "endCharIndex",
      "estimatedPages",
      "confidence",
      "createdAt",
    ]);

    for (const [k, v] of Object.entries(overrides)) {
      if (allowedKeys.has(k as keyof typeof episode)) {
        (episode as any)[k] = v;
      }
    }

    await this.db.insert(schema.episodes).values(episode);
    return episode;
  }
}
