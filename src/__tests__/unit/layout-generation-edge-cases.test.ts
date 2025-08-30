/**
 * Layout generation edge cases tests
 * Tests for race conditions, error handling, and infinite loop prevention
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoggerPort } from '@/infrastructure/logging/logger'
import type { StoragePorts } from '@/infrastructure/storage/ports'
import { generateEpisodeLayout } from '@/services/application/layout-generation'

// Mock LLM modules to avoid API key requirements
vi.mock('@/agents/script/script-converter', () => ({
  convertEpisodeTextToScript: vi.fn().mockResolvedValue({
    style_tone: 'テストトーン',
    style_art: 'テストアート',
    style_sfx: 'テスト効果音',
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
        cut: 'Mock script line for testing',
        camera: 'medium',
        dialogue: [],
      },
    ],
    continuity_checks: [],
  }),
}))

vi.mock('@/agents/structured-generator', () => ({
  getLlmStructuredGenerator: vi.fn().mockReturnValue({
    generateObjectWithFallback: vi.fn().mockResolvedValue({}),
  }),
}))

vi.mock('@/agents/script/page-break-estimator', () => ({
  estimatePageBreaks: vi.fn().mockResolvedValue({
    panels: [
      {
        pageNumber: 1,
        panelIndex: 1,
        content: 'Mock panel content',
        dialogue: [],
      },
    ],
  }),
}))

vi.mock('@/agents/llm/router', () => ({
  createClientForProvider: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({}),
  }),
}))

// Mock panel assignment with configurable behavior
let mockPanelAssignmentBehavior: 'success' | 'empty' | 'insufficient' = 'success'

vi.mock('@/agents/script/panel-assignment', () => ({
  assignPanels: vi.fn().mockImplementation(async () => {
    if (mockPanelAssignmentBehavior === 'empty') {
      return { pages: [] }
    }
    if (mockPanelAssignmentBehavior === 'insufficient') {
      return {
        pages: [
          {
            pageNumber: 1,
            panelCount: 4,
            panels: [],
          },
        ],
      }
    }
    // Default success case - return 4 pages as expected
    return {
      pages: [
        {
          pageNumber: 1,
          panelCount: 4,
          panels: [],
        },
        {
          pageNumber: 2,
          panelCount: 3,
          panels: [],
        },
        {
          pageNumber: 3,
          panelCount: 5,
          panels: [],
        },
        {
          pageNumber: 4,
          panelCount: 4,
          panels: [],
        },
      ],
    }
  }),
  buildLayoutFromPageBreaks: vi.fn().mockImplementation((pageBreaks, episodeMeta) => {
    if (
      mockPanelAssignmentBehavior === 'empty' ||
      !pageBreaks?.panels ||
      pageBreaks.panels.length === 0
    ) {
      return {
        title: episodeMeta.title || 'Test Episode',
        created_at: '2025-08-18',
        episodeNumber: episodeMeta.episodeNumber,
        pages: [],
      }
    }
    if (mockPanelAssignmentBehavior === 'insufficient') {
      return {
        title: episodeMeta.title || 'Test Episode',
        created_at: '2025-08-18',
        episodeNumber: episodeMeta.episodeNumber,
        pages: [
          {
            page_number: 1,
            panels: [],
          },
        ],
      }
    }
    // Success case - return the expected 4 pages
    return {
      title: episodeMeta.title || 'Test Episode',
      created_at: '2025-08-18',
      episodeNumber: episodeMeta.episodeNumber,
      pages: [
        {
          page_number: 1,
          panels: [],
        },
        {
          page_number: 2,
          panels: [],
        },
        {
          page_number: 3,
          panels: [],
        },
        {
          page_number: 4,
          panels: [],
        },
      ],
    }
  }),
  buildLayoutFromAssignment: vi.fn().mockImplementation((script, assignment) => {
    if (
      mockPanelAssignmentBehavior === 'empty' ||
      !assignment?.pages ||
      assignment.pages.length === 0
    ) {
      return {
        title: 'Test Episode',
        created_at: '2025-08-18',
        episodeNumber: 1,
        pages: [],
      }
    }
    if (mockPanelAssignmentBehavior === 'insufficient') {
      return {
        title: 'Test Episode',
        created_at: '2025-08-18',
        episodeNumber: 1,
        pages: [
          {
            page_number: 1,
            panels: [],
          },
        ],
      }
    }
    // Success case - return the expected 4 pages
    return {
      title: 'Test Episode',
      created_at: '2025-08-18',
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [],
        },
        {
          page_number: 2,
          panels: [],
        },
        {
          page_number: 3,
          panels: [],
        },
        {
          page_number: 4,
          panels: [],
        },
      ],
    }
  }),
}))

// Mock logger
const mockLogger: LoggerPort = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  withContext: vi.fn().mockReturnThis(),
}

// Mock storage ports with race condition simulation
const createMockStoragePorts = (simulateFailures = false): StoragePorts => ({
  novel: {
    getNovelText: vi.fn().mockResolvedValue({ text: 'test novel content' }),
    putNovelText: vi.fn(),
  },
  chunk: {
    getChunk: vi.fn().mockResolvedValue({ text: 'test chunk content' }),
    putChunk: vi.fn(),
  },
  analysis: {
    getAnalysis: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        chunkIndex: 0,
        summary: 'test summary',
        characters: [],
        dialogues: [],
        scenes: [],
        highlights: [],
        situations: [],
      }),
    }),
    putAnalysis: vi.fn(),
  },
  layout: {
    getEpisodeLayout: vi.fn().mockResolvedValue(''),
    putEpisodeLayout: vi.fn().mockImplementation(async (_jobId, _episodeNumber, _content) => {
      if (simulateFailures) {
        throw new Error('Simulated storage failure')
      }
    }),
    getEpisodeLayoutProgress: vi.fn().mockResolvedValue(''),
    putEpisodeLayoutProgress: vi
      .fn()
      .mockImplementation(async (_jobId, _episodeNumber, _content) => {
        if (simulateFailures) {
          throw new Error('Simulated progress storage failure')
        }
      }),
  },
  episodeText: {
    putEpisodeText: vi.fn(),
    getEpisodeText: vi.fn().mockResolvedValue(''),
  },
  render: {
    putPageRender: vi.fn(),
    putPageThumbnail: vi.fn(),
    getPageRender: vi.fn(),
  },
  output: {
    putExport: vi.fn(),
    getExport: vi.fn(),
    deleteExport: vi.fn(),
  },
})

// Mock database dependencies
vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn(() => ({
    upsertLayoutStatus: vi.fn().mockResolvedValue(undefined),
    recomputeJobTotalPages: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/repositories/adapters', () => ({
  adaptAll: vi.fn(() => ({
    episode: {},
    job: {},
  })),
}))

vi.mock('@/repositories/episode-repository', () => ({
  EpisodeRepository: vi.fn().mockImplementation(() => ({
    getByJobId: vi.fn().mockResolvedValue([
      {
        id: 'test-episode',
        jobId: 'test-job',
        episodeNumber: 1,
        title: 'Test Episode',
        summary: 'Test summary',
        startChunk: 0,
        endChunk: 0,
        startCharIndex: 0,
        endCharIndex: 100,
        confidence: 0.9,
        createdAt: new Date().toISOString(),
      },
    ]),
  })),
}))

vi.mock('@/repositories/job-repository', () => ({
  JobRepository: vi.fn().mockImplementation(() => ({
    getJobWithProgress: vi.fn().mockResolvedValue({
      id: 'test-job',
      novelId: 'test-novel',
      jobName: 'Test Job',
      status: 'processing',
    }),
    updateStep: vi.fn(),
    markStepCompleted: vi.fn(),
  })),
}))

// Mock PageSplitAgent to simulate infinite loop scenarios
// Using a factory to create fresh state for each test
function createMockPlanNextBatch() {
  let planCallCount = 0
  let allowProgress = false

  const impl = async (episodeData: any, options: any) => {
    planCallCount++
    // console.log(`[DEBUG] mockPlanNextBatch call ${planCallCount}, allowProgress: ${allowProgress}, startPage: ${options?.startPage}`)

    // If allowProgress is true, return successful progress
    if (allowProgress) {
      const startPage = options?.startPage || 1

      // Return pages up to the estimated page limit
      if (startPage <= 4) {
        const pages = []
        for (let i = startPage; i <= Math.min(startPage + 1, 4); i++) {
          pages.push({
            pageNumber: i,
            summary: `test page ${i}`,
            importance: 5,
            segments: [
              {
                contentHint: `test content ${i}`,
                importance: 5,
                source: { chunkIndex: 0, startOffset: (i - 1) * 100, endOffset: i * 100 },
              },
            ],
          })
        }

        return {
          episodeNumber: 1,
          startPage,
          plannedPages: pages,
          mayAdjustPreviousPages: false,
          remainingPagesEstimate: 0, // No more pages needed
        }
      } else {
        // For start pages beyond our target, return empty to signal completion
        return {
          episodeNumber: 1,
          startPage,
          plannedPages: [],
          mayAdjustPreviousPages: false,
          remainingPagesEstimate: 0,
        }
      }
    }

    // Default: simulate no-progress scenario for infinite loop testing
    return {
      episodeNumber: 1,
      startPage: 1, // Always return same startPage to simulate no progress
      plannedPages: [], // Empty pages = no progress
      mayAdjustPreviousPages: false,
      remainingPagesEstimate: 5, // Still have remaining pages
    }
  }

  const fn: any = vi.fn((episodeData: any, options: any) => impl(episodeData, options))
  fn.__controls = {
    setAllowProgress: (value: boolean) => {
      allowProgress = value
    },
    resetCallCount: () => {
      planCallCount = 0
    },
  }

  return fn
}

const mockPlanNextBatch: any = createMockPlanNextBatch()

vi.mock('@/agents/page-splitter', () => ({
  PageSplitAgent: vi.fn().mockImplementation(() => ({
    planNextBatch: mockPlanNextBatch,
  })),
}))

// Mock layout generator
let mockGenerateMangaLayoutForPlan = vi.fn().mockImplementation(async (episodeData, plan) => {
  // Return layouts based on the plan
  const pages = plan.plannedPages.map((plannedPage: any) => ({
    page_number: plannedPage.pageNumber,
    panels: Array.from({ length: 4 }, (_, i) => ({
      position: { x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5 },
      size: { width: 0.5, height: 0.5 },
    })),
  }))

  return { pages }
})

vi.mock('@/agents/layout-generator', () => ({
  generateMangaLayoutForPlan: mockGenerateMangaLayoutForPlan,
}))

vi.mock('@/utils/layout-normalizer', () => ({
  normalizeAndValidateLayout: vi.fn().mockImplementation((layout) => ({
    layout, // Return the layout as-is instead of overriding
    pageIssues: {},
  })),
}))

describe('Layout Generation Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockPlanNextBatch as any).__controls.resetCallCount()
    ;(mockPlanNextBatch as any).__controls.setAllowProgress(false)
    mockPanelAssignmentBehavior = 'success'
  })

  describe('Race Condition Prevention', () => {
    it('should handle storage failures gracefully in atomic write operations', async () => {
      const mockPorts = createMockStoragePorts(true)

      // This should fail due to simulated storage failure
      await expect(
        generateEpisodeLayout('test-job', 1, { isDemo: true }, mockPorts, mockLogger),
      ).rejects.toThrow('Storage operation failed')

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist layout and progress - atomic write failed',
        expect.objectContaining({
          episodeNumber: 1,
          error: 'Simulated storage failure',
        }),
      )
    })

    it('should complete successfully when storage operations succeed', async () => {
      const mockPorts = createMockStoragePorts(false)

      const result = await generateEpisodeLayout(
        'test-job',
        1,
        { isDemo: true },
        mockPorts,
        mockLogger,
      )

      expect(result).toBeDefined()
      expect(result.layout).toBeDefined()
      expect(result.layout.pages).toHaveLength(4)
    })
  })

  describe('Error Handling', () => {
    it('should handle layout building errors gracefully', async () => {
      // Set mock to return empty layout (no pages)
      mockPanelAssignmentBehavior = 'empty'

      const mockPorts = createMockStoragePorts(false)

      await expect(
        generateEpisodeLayout('test-job', 1, { isDemo: true }, mockPorts, mockLogger),
      ).rejects.toThrow('Layout building failed to generate any pages')

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Layout building failed to generate any pages',
        expect.objectContaining({
          episodeNumber: 1,
        }),
      )
    })

    it('should handle insufficient page generation', async () => {
      // Set mock to return insufficient pages (1 page instead of expected)
      // With our changes, this should now succeed (no longer throws error)
      mockPanelAssignmentBehavior = 'insufficient'

      const mockPorts = createMockStoragePorts(false)

      const result = await generateEpisodeLayout(
        'test-job',
        1,
        { isDemo: true },
        mockPorts,
        mockLogger,
      )

      // Should succeed and return the generated layout
      expect(result).toBeDefined()
      expect(result.layout.pages).toHaveLength(1)

      // Verify info log was called (no longer error)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Layout generation completed successfully',
        expect.objectContaining({
          episodeNumber: 1,
          generatedPages: 1,
        }),
      )
    })
  })

  describe('Progress Validation', () => {
    it('should validate script conversion produces valid results', async () => {
      // Mock script converter to return empty script
      const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
      vi.mocked(convertEpisodeTextToScript).mockResolvedValueOnce({
        style_tone: 'x',
        style_art: 'y',
        style_sfx: 'z',
        characters: [],
        locations: [],
        props: [],
        panels: [],
        continuity_checks: [],
      } as any)

      const mockPorts = createMockStoragePorts(false)

      await expect(
        generateEpisodeLayout('test-job', 1, { isDemo: true }, mockPorts, mockLogger),
      ).rejects.toThrow('Script conversion failed to produce valid script')

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Script conversion failed to produce valid script',
        expect.objectContaining({
          episodeNumber: 1,
        }),
      )
    })
  })

  describe('Concurrency Control', () => {
    it('should prevent multiple concurrent layout generations for the same episode', async () => {
      const mockPorts = createMockStoragePorts(false)

      // Start two concurrent layout generations for the same episode
      const promise1 = generateEpisodeLayout('test-job', 1, { isDemo: true }, mockPorts, mockLogger)
      const promise2 = generateEpisodeLayout('test-job', 1, { isDemo: true }, mockPorts, mockLogger)

      // Both should complete successfully, but the second should wait for the first
      const [result1, result2] = await Promise.all([promise1, promise2])

      // Both should return the same result (second one waited for first)
      expect(result1).toEqual(result2)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Layout generation already in progress, waiting for completion',
        expect.objectContaining({
          lockKey: 'test-job:1',
        }),
      )
    })
  })
})
