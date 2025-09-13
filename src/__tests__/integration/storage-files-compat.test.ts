// src/__tests__/integration/storage-files-compat.test.ts
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { cleanupTestDb, createTestDb } from '@/test/utils/simple-test-db'
import { StorageFactory, StorageKeys } from '@/utils/storage'

describe('storage_files compatibility', () => {
  let testDb: ReturnType<typeof createTestDb>
  const userId = 'test-user-' + crypto.randomUUID()
  const novelId = 'novel-' + crypto.randomUUID()
  const jobId = 'job-' + crypto.randomUUID()

  beforeAll(async () => {
    testDb = createTestDb()
    const { db } = testDb

    // 外部キー制約を満たす順序でデータを作成
    await db.insert(schema.users).values({
      id: userId,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
    })

    await db.insert(schema.novels).values({
      id: novelId,
      userId: userId,
      title: 'Test Novel',
      textLength: 1000,
    })

    await db.insert(schema.jobs).values({
      id: jobId,
      novelId: novelId,
      userId: userId,
      status: 'processing',
      currentStep: 'initialized',
    })
  })

  afterAll(() => {
    cleanupTestDb(testDb)
  })

  it('records analysis JSON via storage and can be read from storage_files', async () => {
    const { db } = testDb
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const key = StorageKeys.episodeBoundaries(jobId)

    const payload = JSON.stringify({
      episodes: [],
      metadata: { createdAt: new Date().toISOString() },
    })

    // ストレージに保存（put メソッドを使用）
    await analysisStorage.put(key, payload, {
      metadata: { contentType: 'application/json; charset=utf-8' },
    })

    // storage_files テーブルに記録
    await db.insert(schema.storageFiles).values({
      id: crypto.randomUUID(),
      novelId: novelId,
      jobId: jobId,
      userId: userId,
      filePath: key,
      fileCategory: 'analysis',
      fileType: 'json',
      mimeType: 'application/json; charset=utf-8',
    })

    // 検証
    const file = await analysisStorage.get(key)
    expect(file).not.toBeNull()
    expect(file?.metadata).toBeDefined()

    const dbRecords = await db
      .select()
      .from(schema.storageFiles)
      .where(eq(schema.storageFiles.jobId, jobId))

    expect(dbRecords).toHaveLength(1)
    expect(dbRecords[0].fileCategory).toBe('analysis')
  })

  it('records render image path and can be listed by category', async () => {
    const { db } = testDb
    const renderStorage = await StorageFactory.getRenderStorage()
    const imgKey = StorageKeys.pageRender(jobId, 1, 1)
    const pngBytes = Buffer.from([137, 80, 78, 71])

    // ストレージに保存（put メソッドを使用）
    await renderStorage.put(imgKey, pngBytes, {
      metadata: { contentType: 'image/png' },
    })

    // storage_files テーブルに記録
    await db.insert(schema.storageFiles).values({
      id: crypto.randomUUID(),
      novelId: novelId,
      jobId: jobId,
      userId: userId,
      filePath: imgKey,
      fileCategory: 'render',
      fileType: 'png',
      mimeType: 'image/png',
    })

    // 検証
    const file = await renderStorage.get(imgKey)
    expect(file).not.toBeNull()

    const renderFiles = await db
      .select()
      .from(schema.storageFiles)
      .where(eq(schema.storageFiles.fileCategory, 'render'))

    expect(renderFiles.length).toBeGreaterThan(0)
    expect(renderFiles[0].fileType).toBe('png')
  })
})
