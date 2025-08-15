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
      novel: Pick<schema.NewNovel, "title" | "textLength"> & 
        Partial<Pick<schema.NewNovel, "author" | "originalTextPath" | "language" | "metadataPath">>
    ): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(schema.novels).values({
        id,
        title: novel.title,
        author: novel.author || null,
        originalTextPath: novel.originalTextPath || null,
        textLength: novel.textLength,
        language: novel.language || "ja",
        metadataPath: novel.metadataPath || null,
      });
      return id;
    },
    async ensureNovel(
      id: string,
      novel: Pick<schema.NewNovel, "title" | "textLength"> & 
        Partial<Pick<schema.NewNovel, "author" | "originalTextPath" | "language" | "metadataPath">>
    ): Promise<void> {
      await db
        .insert(schema.novels)
        .values({
          id,
          title: novel.title,
          author: novel.author || null,
          originalTextPath: novel.originalTextPath || null,
          textLength: novel.textLength,
          language: novel.language || "ja",
          metadataPath: novel.metadataPath || null,
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
      jobName?: string | null;
      totalChunks?: number;
      status?: "pending" | "processing" | "completed" | "failed" | "paused";
    }) {
      const id = payload.id || crypto.randomUUID();
      await db.insert(schema.jobs).values({
        id,
        novelId: payload.novelId,
        jobName: payload.jobName || null,
        status: payload.status || "processing",
        currentStep: "initialized",
        totalChunks: payload.totalChunks || 0,
      });
      return id;
    },
    async updateJobStep(
      id: string,
      step: "initialized" | "split" | "analyze" | "episode" | "layout" | "render" | "complete",
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
        currentStep: step,
      };
      await db
        .update(schema.jobs)
        .set(updateData)
        .where(eq(schema.jobs.id, id));
    },
    async markJobStepCompleted(id: string, step: "split" | "analyze" | "episode" | "layout" | "render") {
      const updateData: Partial<schema.Job> = {};
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
    async updateJobStatus(id: string, status: "pending" | "processing" | "completed" | "failed" | "paused") {
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
          currentStep: job.currentStep || "initialized",
          processedChunks: job.processedChunks || 0,
          totalChunks: job.totalChunks || 0,
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
    async createChunksBatch(payloads: Omit<schema.NewChunk, "id" | "createdAt">[]) {
      for (const p of payloads) {
        await db
          .insert(schema.chunks)
          .values({ id: crypto.randomUUID(), ...p });
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
      return rows.map((r) => ({
        chunkIndex: r.chunkIndex,
        // Note: chunks table doesn't have text field, only contentPath
        contentPath: r.contentPath,
      }));
    },
    async getEpisodesByJobId(jobId: string) {
      const rows = await db
        .select()
        .from(schema.episodes)
        .where(eq(schema.episodes.jobId, jobId))
        .orderBy(asc(schema.episodes.episodeNumber));
      return rows;
    },
    async updateJobError(id: string, error: string, errorStep?: string) {
      await db
        .update(schema.jobs)
        .set({
          status: "error",
          lastError: error,
          lastErrorStep: errorStep,
        })
        .where(eq(schema.jobs.id, id));
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
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
    const nowId = crypto.randomUUID();
    const novelId = overrides.novelId || "test-novel-default";
    const jobId = overrides.jobId || "test-job-default";
    const chunkIndex = overrides.chunkIndex ?? 0;
    const contentPath = overrides.contentPath ?? `${jobId}/chunks/${chunkIndex}.txt`;
    const startPosition = overrides.startPosition ?? 0;
    const endPosition = overrides.endPosition ?? 100;
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
      if (allowedKeys.has(k as keyof typeof chunk) && v !== undefined) {
        (chunk as Record<string, unknown>)[k] = v;
      }
    }

    await this.db.insert(schema.chunks).values(chunk);
    return chunk;
  }

  async createEpisode(
    overrides: Partial<typeof schema.episodes.$inferInsert> = {}
  ) {
    const nowId = crypto.randomUUID();
    const novelId = overrides.novelId || "test-novel-default";
    const jobId = overrides.jobId || "test-job-default";

    const episode: typeof schema.episodes.$inferInsert = {
      id: nowId,
      novelId,
      jobId,
      episodeNumber: overrides.episodeNumber ?? 1,
      title: overrides.title ?? "Test Episode",
      summary: overrides.summary ?? "Test episode summary",
      startChunk: overrides.startChunk ?? 0,
      startCharIndex: overrides.startCharIndex ?? 0,
      endChunk: overrides.endChunk ?? 1,
      endCharIndex: overrides.endCharIndex ?? 100,
      estimatedPages: overrides.estimatedPages ?? 5,
      confidence: overrides.confidence ?? 0.9,
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
      if (allowedKeys.has(k as keyof typeof episode) && v !== undefined) {
        (episode as Record<string, unknown>)[k] = v;
      }
    }

    await this.db.insert(schema.episodes).values(episode);
    return episode;
  }
}
