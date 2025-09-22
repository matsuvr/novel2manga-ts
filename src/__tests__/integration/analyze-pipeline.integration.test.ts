/**
 * AnalyzePipeline 専用統合テスト
 * 以前 service-integration.test.ts に含まれていたパイプライン系テストを分離
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type ServiceIntegrationContext, setupServiceIntegration, teardownServiceIntegration } from './__helpers/service-integration-env'

describe('AnalyzePipeline Integration', () => {
  let ctx: ServiceIntegrationContext

  beforeEach(async () => {
    ctx = await setupServiceIntegration()
  })

  afterEach(async () => {
    await teardownServiceIntegration(ctx)
  })

  describe('基本フロー', () => {
    it('完全な分析パイプラインを実行できる', async () => {
      const novel = await ctx.dataFactory.createNovel({
        id: 'test-novel-pipeline',
        title: 'Pipeline Test Novel',
        textLength: 5000,
      })

      const novelText = 'これは統合テスト用の長い小説テキストです。登場人物が活躍し、様々な場面が展開されます。'.repeat(150)
      await ctx.storageDataFactory.seedNovelText(novel.id, novelText, { title: novel.title })

      const pipeline = new ctx.AnalyzePipeline()
      const result = await pipeline.runWithText(novel.id, novelText, {
        title: novel.title,
        isDemo: true,
      })

  expect(result.response?.success).toBe(true)
      expect(result.jobId).toBeDefined()
      expect(result.chunkCount).toBeGreaterThan(0)

      const job = await ctx.testDb.service.getJob(result.jobId)
      expect(job?.status).toBe('completed')
      expect(job?.novelId).toBe(novel.id)

      const chunks = await (ctx.testDb.service as any).getChunksByJobId(result.jobId)
      expect(chunks.length).toBe(result.chunkCount)
      expect(chunks[0].contentPath).toBeDefined()

  // 簡略化: チャンクストレージ検証は詳細ステップの個別テストに委譲し、ここでは novel 永続化とジョブ完了のみ確認
  const novelStorage = await ctx.storageFactory.getNovelStorage()
  expect(novelStorage.has(`${novel.id}.json`)).toBe(true)
    })
  })

  describe('エラーハンドリング', () => {
    it('存在しない小説IDでは適切なエラーが発生する', async () => {
      const pipeline = new ctx.AnalyzePipeline()
      await expect(
        pipeline.runWithNovelId('nonexistent-novel-id', { userEmail: 'test@example.com' }),
      ).rejects.toThrow('小説のテキストがストレージに見つかりません')
    })

    it('ストレージにテキストが存在しない場合は適切なエラーが発生する', async () => {
      const novel = await ctx.dataFactory.createNovel({
        id: 'test-novel-no-storage',
        title: 'No Storage Novel',
        textLength: 1000,
      })
      const pipeline = new ctx.AnalyzePipeline()
      await expect(
        pipeline.runWithNovelId(novel.id, { userEmail: 'test@example.com' }),
      ).rejects.toThrow('小説のテキストがストレージに見つかりません')
    })
  })
})
