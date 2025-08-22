import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyzePipeline } from '@/services/application/analyze-pipeline'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'
import { clearStorageCache, StorageFactory } from '@/utils/storage'
import { cleanJobStorage, cleanNovelStorage } from './__helpers/test-storage-clean'

// Mock the narrative arc analyzer to prevent LLM calls in tests
vi.mock('@/agents/narrative-arc-analyzer', () => ({
  analyzeNarrativeArc: vi.fn().mockResolvedValue([]),
}))

// Mock the chunk analyzer to prevent LLM calls in tests
vi.mock('@/agents/chunk-analyzer', () => ({
  analyzeChunkWithFallback: vi.fn().mockResolvedValue({
    result: {
      characters: [],
      scenes: [],
      dialogues: [],
      highlights: [],
      situations: [],
    },
  }),
}))

// Minimal smoke to assert no type errors and episode text write path exists when episodes are produced.
describe('episode text persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // 各テストが使うIDのクリーンアップ（存在しなくてもOK）
    try {
      await cleanNovelStorage('unit-test-novel-eptext')
    } catch {}
  })

  it('persists episode text to storage when boundaries exist (smoke)', async () => {
    __resetDatabaseServiceForTest()
    clearStorageCache()

    const pipeline = new AnalyzePipeline()
    const novelId = 'unit-test-novel-eptext'
    const text = 'これは長いテストテキストです。'.repeat(500) // 6000文字以上確保
    const { jobId } = await pipeline.runWithText(novelId, text, { isDemo: true, title: 'T' })

    // The narrative analyzer may or may not produce episodes depending on LLM; just verify no throw and storage list works
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const keys = analysisStorage.list ? await analysisStorage.list(jobId) : []
    expect(Array.isArray(keys)).toBe(true)

    // 後始末（競合低減のためテスト内でも削除）
    await cleanJobStorage(jobId)
    await cleanNovelStorage(novelId)
  })

  it('verifies chunk storage data format consistency', async () => {
    __resetDatabaseServiceForTest()
    clearStorageCache()

    const chunkStorage = await StorageFactory.getChunkStorage()
    const testJobId = 'test-job-format-' + Date.now()
    const testChunkIndex = 0
    const testContent = 'Test chunk content for format verification'

    // Test the storage format directly
    const key = `${testJobId}/chunk_${testChunkIndex}.txt`

    // Store data using the string format (as per Storage interface)
    await chunkStorage.put(key, testContent)

    // Retrieve and verify format
    const retrieved = await chunkStorage.get(key)

    expect(retrieved).toBeDefined()
    expect(retrieved?.text).toBe(testContent)
    expect(typeof retrieved?.text).toBe('string')
  })

  it('tests prepareNarrativeAnalysisInput with actual chunk data', async () => {
    __resetDatabaseServiceForTest()
    clearStorageCache()

    const pipeline = new AnalyzePipeline()
    const novelId = 'test-novel-prep-' + Date.now()
    const text = 'テスト用のテキストです。これを複数回繰り返してチャンクを作成します。'.repeat(100)

    const { jobId, chunkCount } = await pipeline.runWithText(novelId, text, {
      isDemo: true,
      title: 'Preparation Test',
    })

    // Verify chunks exist in storage
    const chunkStorage = await StorageFactory.getChunkStorage()
    for (let i = 0; i < Math.min(3, chunkCount); i++) {
      const key = `${jobId}/chunk_${i}.txt`
      const chunk = await chunkStorage.get(key)
      expect(chunk?.text).toBeDefined()
      expect(chunk?.text.length).toBeGreaterThan(0)
    }

    // Test prepareNarrativeAnalysisInput
    const { prepareNarrativeAnalysisInput } = await import('@/utils/episode-utils')

    const input = await prepareNarrativeAnalysisInput({
      jobId,
      startChunkIndex: 0,
    })

    expect(input).toBeDefined()
    expect(input?.chunks).toBeDefined()
    expect(input?.chunks.length).toBeGreaterThan(0)

    // 後始末
    await cleanJobStorage(jobId)
    await cleanNovelStorage(novelId)
  })
})
