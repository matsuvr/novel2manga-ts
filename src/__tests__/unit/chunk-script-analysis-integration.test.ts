import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertChunkToMangaScript } from '@/agents/script/script-converter'
import { ChunkScriptStep } from '@/services/application/steps/chunk-script-step'

// Mock the script converter
vi.mock('@/agents/script/script-converter', () => ({
  convertChunkToMangaScript: vi.fn(),
}))

// Mock the repositories
vi.mock('@/repositories', () => ({
  getJobRepository: vi.fn(() => ({
    updateStep: vi.fn(),
  })),
}))

// Mock the storage utilities
vi.mock('@/utils/storage', async (importOriginal) => {
  await importOriginal()
  return {
    StorageFactory: {
      getAnalysisStorage: vi.fn(),
    },
    JsonStorageKeys: {
      scriptChunk: vi.fn(),
    },
    StorageKeys: {
      chunkAnalysis: vi.fn(),
    },
  }
})

describe('ChunkScriptStep - Analysis Integration', () => {
  let chunkScriptStep: ChunkScriptStep
  let mockStorage: {
    get: ReturnType<typeof vi.fn>
    put: ReturnType<typeof vi.fn>
  }
  let mockLogger: any
  const mockPorts = {
    novel: {} as any,
    chunk: {} as any,
    analysis: {} as any,
    layout: {} as any,
    episodeText: {} as any,
    render: {} as any,
    output: {} as any,
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    chunkScriptStep = new ChunkScriptStep()

    mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
    }

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      withContext: vi.fn().mockReturnThis(),
    }

    // Setup storage mocks
    const storageModule = await import('@/utils/storage')
    vi.mocked(storageModule.StorageFactory.getAnalysisStorage).mockResolvedValue(mockStorage as any)
    vi.mocked(storageModule.JsonStorageKeys.scriptChunk).mockReturnValue(
      'job-1/script_chunk_0.json',
    )
    vi.mocked(storageModule.StorageKeys.chunkAnalysis).mockReturnValue('job-1/chunk_0.json')

    // Setup script converter mock
    vi.mocked(convertChunkToMangaScript).mockResolvedValue({
      style_tone: 'テスト用トーン',
      style_art: 'テスト用アート',
      style_sfx: 'テスト用効果音',
      characters: [
        {
          id: 'char_1',
          name_ja: 'テストキャラ',
          role: 'protagonist',
          speech_style: 'カジュアル',
          aliases: ['テスト'],
        },
      ],
      locations: [
        {
          id: 'loc_1',
          name_ja: 'テスト場所',
          notes: 'テスト用場所',
        },
      ],
      props: [],
      panels: [
        {
          no: 1,
          cut: 'テストシーン説明',
          camera: 'medium',
          dialogue: [],
        },
      ],
      continuity_checks: [],
    })
  })

  it('should pass analysis data to convertEpisodeTextToScript when analysis file exists', async () => {
    const jobId = 'test-job-123'
    const chunks = ['Test chunk content with character dialogue.']
    const context = { jobId, logger: mockLogger }

    // Mock analysis data
    const mockAnalysisData = {
      text: JSON.stringify({
        chunkIndex: 0,
        jobId: 'test-job-123',
        analysis: {
          characters: [
            { name: 'Alice', description: 'The protagonist' },
            { name: 'Bob', description: 'Supporting character' },
          ],
          scenes: [{ location: 'Park', time: '12:00', description: 'Sunny day in the park' }],
          dialogues: [{ speaker: 'Alice', text: 'Hello Bob!', content: 'Greeting' }],
          highlights: [{ type: 'emotion', importance: 9, description: 'Alice shows excitement' }],
          situations: [{ description: 'Characters meet for the first time' }],
        },
        analyzedAt: '2025-08-28T14:18:07.290Z',
      }),
    }

    mockStorage.get.mockResolvedValue(mockAnalysisData)

    // Execute
    const result = await chunkScriptStep.convertChunksToScripts(chunks, {
      ...context,
      novelId: 'n1',
      ports: mockPorts as any,
    })

    // Verify result
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.completed).toBe(true)
      expect(result.data.chunkCount).toBe(1)
    }

    // Verify that analysis data was passed correctly
    expect(convertChunkToMangaScript).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkText: 'Test chunk content with character dialogue.',
        chunkIndex: 1,
        chunksNumber: 1,
        charactersList: expect.any(String),
        scenesList: expect.any(String),
        dialoguesList: expect.any(String),
        highlightLists: expect.any(String),
        situations: expect.any(String),
      }),
      { jobId, isDemo: undefined },
    )

    // Verify logging
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Converting chunk to manga script',
      expect.objectContaining({
        jobId,
        chunkIndex: 0,
        hasAnalysis: true,
        totalChunks: 1,
        textLength: expect.any(Number),
      }),
    )
  })

  it('should proceed without analysis data when analysis file does not exist', async () => {
    const jobId = 'test-job-456'
    const chunks = ['Test chunk without analysis.']
    const context = { jobId, logger: mockLogger }

    // Mock storage returning null (file doesn't exist)
    mockStorage.get.mockResolvedValue(null)

    // Execute
    const result = await chunkScriptStep.convertChunksToScripts(chunks, {
      ...context,
      novelId: 'n1',
      ports: mockPorts as any,
    })

    // Verify result
    expect(result.success).toBe(true)

    // Verify that convertChunkToMangaScript was called with minimal data
    expect(convertChunkToMangaScript).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkText: 'Test chunk without analysis.',
        chunkIndex: 1,
        chunksNumber: 1,
      }),
      { jobId, isDemo: undefined },
    )

    // Verify info was logged about no analysis data
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Analysis data not found for chunk',
      expect.objectContaining({
        jobId,
        chunkIndex: 0,
      }),
    )
  })

  it('should handle corrupted analysis data gracefully', async () => {
    const jobId = 'test-job-789'
    const chunks = ['Test chunk with corrupted analysis.']
    const context = { jobId, logger: mockLogger }

    // Mock corrupted analysis data
    mockStorage.get.mockResolvedValue({ text: 'invalid json{' })

    // Execute
    const result = await chunkScriptStep.convertChunksToScripts(chunks, {
      ...context,
      novelId: 'n1',
      ports: mockPorts as any,
    })

    // Verify result
    expect(result.success).toBe(true)

    // Verify that convertChunkToMangaScript was called with minimal data
    expect(convertChunkToMangaScript).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkText: 'Test chunk with corrupted analysis.',
        chunkIndex: 1,
        chunksNumber: 1,
      }),
      { jobId, isDemo: undefined },
    )

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to read chunk analysis',
      expect.objectContaining({
        jobId,
        chunkIndex: 0,
        error: expect.any(String),
      }),
    )
  })

  it('loads chunk text from storage when in-memory chunks are empty (resume scenario)', async () => {
    const jobId = 'resume-job-001'
    const chunks = ['']
    const context = { jobId, logger: mockLogger }

    // Mock chunk storage port to return text
    const mockChunkText = 'abcdefg resume text'
    ;(mockPorts.chunk as any).getChunk = vi.fn().mockResolvedValue({ text: mockChunkText })

    // No analysis data
    mockStorage.get.mockResolvedValue(null)

    const result = await chunkScriptStep.convertChunksToScripts(chunks, {
      ...context,
      novelId: 'n1',
      ports: mockPorts as any,
    })

    expect(result.success).toBe(true)
    expect(convertChunkToMangaScript).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkText: mockChunkText,
        chunkIndex: 1,
        chunksNumber: 1,
      }),
      { jobId, isDemo: undefined },
    )

    // Ensure storage loader was used
    expect((mockPorts.chunk as any).getChunk).toHaveBeenCalledWith(jobId, 0)
  })
})
