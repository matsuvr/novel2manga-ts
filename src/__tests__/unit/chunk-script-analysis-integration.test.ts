import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertEpisodeTextToScript } from '@/agents/script/script-converter'
import { ChunkScriptStep } from '@/services/application/steps/chunk-script-step'

// Mock the script converter
vi.mock('@/agents/script/script-converter', () => ({
  convertEpisodeTextToScript: vi.fn(),
}))

// Mock the repositories
vi.mock('@/repositories', () => ({
  getJobRepository: vi.fn(() => ({
    updateStep: vi.fn(),
  })),
}))

// Mock the storage utilities
vi.mock('@/utils/storage', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
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
  let mockLogger: {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
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
    }

    // Setup storage mocks
    const storageModule = await import('@/utils/storage')
    vi.mocked(storageModule.StorageFactory.getAnalysisStorage).mockResolvedValue(mockStorage)
    vi.mocked(storageModule.JsonStorageKeys.scriptChunk).mockReturnValue(
      'job-1/script_chunk_0.json',
    )
    vi.mocked(storageModule.StorageKeys.chunkAnalysis).mockReturnValue('job-1/chunk_0.json')

    // Setup script converter mock
    vi.mocked(convertEpisodeTextToScript).mockResolvedValue({
      title: 'Test Episode',
      scenes: [
        {
          id: '1',
          setting: 'Test setting',
          script: [{ type: 'narration', text: 'Test narration' }],
        },
      ],
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
    const result = await chunkScriptStep.convertChunksToScripts(chunks, context)

    // Verify result
    expect(result.success).toBe(true)
    expect(result.data?.completed).toBe(true)
    expect(result.data?.chunkCount).toBe(1)

    // Verify that analysis data was passed correctly
    expect(convertEpisodeTextToScript).toHaveBeenCalledWith(
      {
        episodeText: 'Test chunk content with character dialogue.',
        characterList: 'Alice: The protagonist, Bob: Supporting character',
        sceneList: 'Park (12:00): Sunny day in the park',
        dialogueList: 'Alice: "Hello Bob!"',
        highlightList: 'emotion (importance: 9): Alice shows excitement',
        situationList: 'Characters meet for the first time',
      },
      { jobId, episodeNumber: 1, useFragmentConversion: false },
    )

    // Verify logging
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Converting chunk to script with analysis data',
      expect.objectContaining({
        jobId,
        chunkIndex: 0,
        hasCharacters: true,
        hasScenes: true,
        hasDialogues: true,
        hasHighlights: true,
        hasSituations: true,
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
    const result = await chunkScriptStep.convertChunksToScripts(chunks, context)

    // Verify result
    expect(result.success).toBe(true)

    // Verify that convertEpisodeTextToScript was called with minimal data
    expect(convertEpisodeTextToScript).toHaveBeenCalledWith(
      {
        episodeText: 'Test chunk without analysis.',
      },
      { jobId, episodeNumber: 1, useFragmentConversion: false },
    )

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Analysis data not found for chunk, proceeding without it',
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
    const result = await chunkScriptStep.convertChunksToScripts(chunks, context)

    // Verify result
    expect(result.success).toBe(true)

    // Verify that convertEpisodeTextToScript was called with minimal data
    expect(convertEpisodeTextToScript).toHaveBeenCalledWith(
      {
        episodeText: 'Test chunk with corrupted analysis.',
      },
      { jobId, episodeNumber: 1, useFragmentConversion: false },
    )

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to read or parse chunk analysis, proceeding without it',
      expect.objectContaining({
        jobId,
        chunkIndex: 0,
      }),
    )
  })
})
