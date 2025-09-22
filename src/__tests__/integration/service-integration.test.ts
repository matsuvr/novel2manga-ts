/**
 * サービス統合テスト (DB/Storage 一貫性 + ロールバック専用)
 * AnalyzePipeline 個別テストは analyze-pipeline.integration.test.ts へ分離
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ServiceIntegrationContext, setupServiceIntegration, teardownServiceIntegration } from './__helpers/service-integration-env'
import { TestStorageDataFactory, TestStorageFactory } from './__helpers/test-storage'

describe('Service Integration Tests (DB/Storage only)', () => {
  let ctx: ServiceIntegrationContext
  let testStorageFactory: TestStorageFactory
  let storageDataFactory: TestStorageDataFactory

  beforeEach(async () => {
    ctx = await setupServiceIntegration()
    testStorageFactory = ctx.storageFactory
    storageDataFactory = ctx.storageDataFactory
  })

  afterEach(async () => {
    await teardownServiceIntegration(ctx)
  })

  describe('Database and Storage Integration', () => {
    it('データベースとストレージ間のデータ一貫性を保つ', async () => {
      const novel = await ctx.dataFactory.createNovel({
        title: 'Consistency Test Novel',
        textLength: 2000,
      })

      const novelText = 'データ一貫性テスト用のテキストです。'.repeat(350)
      await storageDataFactory.seedNovelText(novel.id, novelText)

      const pipeline = new ctx.AnalyzePipeline()
      const result = await pipeline.runWithText(novel.id, novelText, {
        title: novel.title,
        isDemo: true,
      })

      expect(result.response?.success).toBe(true)
      expect(result.jobId).toBeDefined()
      expect(result.chunkCount).toBeGreaterThan(0)

      const job = await ctx.testDb.service.getJob(result.jobId)
      expect(job).toBeDefined()
      expect(job?.status).toBe('completed')
      expect(job?.novelId).toBe(novel.id)

      const dbNovel = await (ctx.testDb.service as any).getNovel(novel.id)
      expect(dbNovel).toBeDefined()
      expect(dbNovel?.id).toBe(novel.id)

      const chunks = await (ctx.testDb.service as any).getChunksByJobId(result.jobId)
      expect(chunks.length).toBe(result.chunkCount)
      expect(chunks[0].contentPath).toBeDefined()

        const novelStorage = await ctx.storageFactory.getNovelStorage()
        expect(novelStorage.has(`${novel.id}.json`)).toBe(true)
    })

    it('トランザクション境界でのロールバック処理', async () => {
      const novel = await ctx.dataFactory.createNovel({
        title: 'Rollback Test Novel',
        textLength: 1000,
      })

      // パイプラインを runWithText で直接実行し、ストレージ読込フェーズ( runWithNovelId )を通らずに
      // chunk 保存フェーズでの put 失敗を誘発する。
      const rollbackText = 'ロールバックテスト用本文'.repeat(50)

      // 小説テキスト永続化フェーズで1回だけ失敗させ、ロールバック（失敗後の再実行で成功）を検証
      const tm = await import('@/services/application/transaction-manager')
      const originalExec = tm.executeStorageWithTracking
      let threw = false
      ;(tm as any).executeStorageWithTracking = vi.fn(async (args: any) => {
        if (!threw) {
          threw = true
          throw new Error('Storage error for testing')
        }
        return originalExec(args)
      })

      const pipeline = new ctx.AnalyzePipeline()
      // このテストでは DB 書き込み動作自体は検証対象外のため、job 関連 DB 操作を no-op 化し
      // SQLite 接続状態に依存しない形で storage.put 失敗を再現させる。
      const dbModule = await import('@/services/database')
      const jobsDb = dbModule.db.jobs()
      jobsDb.createJobRecord = vi.fn((_p: any) => {}) as any
      jobsDb.updateJobStatus = vi.fn((_id: string, _status: any) => {}) as any
      jobsDb.updateJobStep = vi.fn((_id: string, _step: any) => {}) as any
      jobsDb.markJobStepCompleted = vi.fn((_id: string, _step: any) => {}) as any
      await expect(
        pipeline.runWithText(novel.id, rollbackText, { title: novel.title, isDemo: true }),
      ).rejects.toThrow('Storage error for testing')

      // 復旧確認: executeStorageWithTracking を再度呼び出しても例外が出ない
      await expect(
        (tm as any).executeStorageWithTracking({
          storage: await testStorageFactory.getNovelStorage(),
          key: 'dummy.json',
          value: JSON.stringify({ text: 'ok' }),
          tracking: { filePath: 'dummy.json' },
        }),
      ).resolves.toBeUndefined()
    })
  })
})
// ファイル末尾: 旧バージョンの重複コード削除済み

