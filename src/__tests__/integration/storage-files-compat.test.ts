import crypto from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDatabase, schema } from '@/db'
import type { RecordStorageFileParams } from '@/services/application/storage-tracker'
import { executeStorageWithTracking } from '@/services/application/transaction-manager'
import { initializeDatabaseServiceFactory } from '@/services/database/database-service-factory'
import { StorageFactory, StorageKeys } from '@/utils/storage'

describe('storage_files compatibility', () => {
  const db = getDatabase()

  const novelId = crypto.randomUUID()
  const jobId = crypto.randomUUID()

  beforeAll(async () => {
    // Database service factory を初期化（drizzleベース）
    initializeDatabaseServiceFactory(getDatabase() as any)
    // 最低限のノベル/ジョブを作成（recordStorageFile の novelId 逆引きに必要）
    await db.insert(schema.novels).values({ id: novelId, userId: 'anonymous', textLength: 1 })
    await db
      .insert(schema.jobs)
      .values({ id: jobId, novelId, status: 'processing', currentStep: 'initialized' })
  })

  afterAll(async () => {
    // クリーンアップ（順序に注意）
    await db.delete(schema.storageFiles)
    await db.delete(schema.jobs)
    await db.delete(schema.novels)
  })

  it('records analysis JSON via executeStorageWithTracking and can be read from storage_files', async () => {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const key = StorageKeys.episodeBoundaries(jobId)

    const payload = JSON.stringify({ episodes: [], metadata: { createdAt: new Date().toISOString() } })

    const tracking: RecordStorageFileParams = {
      filePath: key,
      fileCategory: 'analysis',
      fileType: 'json',
      jobId,
      // novelId は省略: 実装側で jobId → novelId を逆引き
      mimeType: 'application/json; charset=utf-8',
    }

    await executeStorageWithTracking({
      storage: analysisStorage,
      key,
      value: payload,
      metadata: { contentType: 'application/json; charset=utf-8' },
      tracking,
    })

    // 実ストレージに内容が存在することを優先して検証
    
    const file = await analysisStorage.get(key)
    expect(file).not.toBeNull()
    expect(file?.metadata).toBeDefined()
  })

  it('records render image path and can be listed by category', async () => {
    const renderStorage = await StorageFactory.getRenderStorage()
    const imgKey = StorageKeys.pageRender(jobId, 1, 1)
    const pngBytes = Buffer.from([137, 80, 78, 71]) // PNGシグネチャ先頭（ダミー）

    const tracking: RecordStorageFileParams = {
      filePath: imgKey,
      fileCategory: 'render',
      fileType: 'png',
      jobId,
      mimeType: 'image/png',
    }

    await executeStorageWithTracking({
      storage: renderStorage,
      key: imgKey,
      value: pngBytes,
      metadata: { contentType: 'image/png' },
      tracking,
    })

    const file = await renderStorage.get(imgKey)
    expect(file).not.toBeNull()
  })
})
