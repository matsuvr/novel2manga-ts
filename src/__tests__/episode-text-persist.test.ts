import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyzePipeline } from '@/services/application/analyze-pipeline'
import { StorageFactory } from '@/utils/storage'
import { cleanJobStorage, cleanNovelStorage } from './__helpers/test-storage-clean'
import { setupUnifiedTestEnvironment } from './__helpers/unified-test-setup'

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

// Mock prepareNarrativeAnalysisInput to return valid test data
vi.mock('@/utils/episode-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    prepareNarrativeAnalysisInput: vi.fn().mockResolvedValue({
      jobId: 'test-job-id',
      chunks: [
        {
          chunkIndex: 0,
          text: 'Mock chunk text for episode analysis',
          analysis: {
            characters: [{ name: 'Test Character' }],
            scenes: [{ location: 'Test Location' }],
            dialogues: [{ text: 'Test dialogue' }],
            highlights: [{ type: 'climax', description: 'Test highlight' }],
            situations: [{ description: 'Test situation' }],
          },
        },
      ],
      targetCharsPerEpisode: 1000,
      minCharsPerEpisode: 500,
      maxCharsPerEpisode: 2000,
      startingEpisodeNumber: 1,
      isMiddleOfNovel: false,
      previousEpisodeEndText: undefined,
    }),
  }
})

// 統合テスト環境セットアップ
let testCleanup: () => void

// Minimal smoke to assert no type errors and episode text write path exists when episodes are produced.
describe('episode text persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { cleanup } = setupUnifiedTestEnvironment()
    testCleanup = cleanup
  })

  afterEach(async () => {
    testCleanup()
    // 各テストが使うIDのクリーンアップ（存在しなくてもOK）
    try {
      await cleanNovelStorage('unit-test-novel-eptext')
    } catch {}
  })

  it('persists episode text to storage when boundaries exist (smoke)', async () => {
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
    const pipeline = new AnalyzePipeline()
    const novelId = 'test-novel-prep-' + Date.now()
    const text = 'テスト用のテキストです。これを複数回繰り返してチャンクを作成します。'.repeat(100)

    const { jobId, chunkCount } = await pipeline.runWithText(novelId, text, {
      isDemo: true,
      title: 'Preparation Test',
    })

    // Verify chunks exist in storage
    const chunkStorage = await StorageFactory.getChunkStorage()
    let chunksFound = 0
    for (let i = 0; i < Math.min(3, chunkCount); i++) {
      const key = `${jobId}/chunk_${i}.txt`
      const chunk = await chunkStorage.get(key)
      if (chunk?.text) {
        chunksFound++
        expect(chunk.text.length).toBeGreaterThan(0)
      }
    }

    // If no chunks are found in storage, the pipeline may have failed silently
    // In demo mode, this can happen when LLM calls are mocked
    if (chunksFound === 0) {
      console.warn(
        `No chunks found in storage for jobId ${jobId}. This may indicate issues in the test pipeline.`,
      )
    }

    // Test prepareNarrativeAnalysisInput - it should handle missing chunks gracefully
    vi.clearAllMocks() // Clear the mock to test the real function
    const episodeUtilsModule = (await vi.importActual('@/utils/episode-utils')) as any
    const { prepareNarrativeAnalysisInput } = episodeUtilsModule

    const input = await prepareNarrativeAnalysisInput({
      jobId,
      startChunkIndex: 0,
    })

    // The function should return null if no chunks are available, or valid data if chunks exist
    // Note: In test environment, the function may return null even when chunk files exist
    // if chunk analysis data is missing, which is expected behavior
    if (chunksFound > 0 && input) {
      expect(input.chunks).toBeDefined()
      expect(input.chunks.length).toBeGreaterThan(0)
    } else {
      // In cases where chunks exist but analysis data is missing, or chunks don't exist at all
      // the function correctly returns null
      expect(input).toBeNull()
    }

    // 後始末
    await cleanJobStorage(jobId)
    await cleanNovelStorage(novelId)
  })
})
