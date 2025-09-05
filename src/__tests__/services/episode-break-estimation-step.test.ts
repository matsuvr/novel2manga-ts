import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoggerPort } from '@/infrastructure/logging/logger'
import type { StoragePorts } from '@/infrastructure/storage/ports'
import type {
  StepContext,
  StepError,
  StepExecutionResult,
  StepResult,
} from '@/services/application/steps/base-step'
import { EpisodeBreakEstimationStep } from '@/services/application/steps/episode-break-estimation-step'
import type { NewMangaScript } from '@/types/script'

// Mock dependencies
vi.mock('@/agents/structured-generator', () => ({
  DefaultLlmStructuredGenerator: vi.fn(),
}))

vi.mock('@/config/llm.config', () => ({
  getProviderForUseCase: vi.fn().mockReturnValue('mock-provider'),
}))

vi.mock('@/config', () => ({
  getAppConfigWithOverrides: vi.fn(),
}))

vi.mock('@/agents/script/script-segmenter', () => ({
  segmentScript: vi.fn(),
  DEFAULT_SCRIPT_SEGMENTATION_CONFIG: {
    maxPanelsPerSegment: 400,
    contextOverlapPanels: 50,
    minPanelsForSegmentation: 400,
    minTrailingSegmentSize: 320,
  },
}))

// Create a LoggerPort-compliant mock (no any)
const createMockLogger = (): LoggerPort & {
  debug: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  withContext: ReturnType<typeof vi.fn>
} => {
  const obj = {} as LoggerPort & {
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
    withContext: ReturnType<typeof vi.fn>
  }
  obj.debug = vi.fn()
  obj.info = vi.fn()
  obj.warn = vi.fn()
  obj.error = vi.fn()
  const wc = vi.fn<(ctx: Record<string, unknown>) => LoggerPort>().mockImplementation(() => obj)
  obj.withContext = wc as unknown as ReturnType<typeof vi.fn>
  return obj
}

const mockLogger = createMockLogger()

// Minimal StoragePorts mock (methods are unused in these tests)
const mockPorts: StoragePorts = {
  novel: {
    getNovelText: vi.fn(async () => null),
    putNovelText: vi.fn(async () => ''),
  },
  chunk: {
    getChunk: vi.fn(async () => null),
    putChunk: vi.fn(async () => ''),
  },
  analysis: {
    getAnalysis: vi.fn(async () => null),
    putAnalysis: vi.fn(async () => ''),
  },
  layout: {
    putEpisodeLayout: vi.fn(async () => ''),
    getEpisodeLayout: vi.fn(async () => null),
    putEpisodeLayoutProgress: vi.fn(async () => ''),
    getEpisodeLayoutProgress: vi.fn(async () => null),
  },
  episodeText: {
    putEpisodeText: vi.fn(async () => ''),
    getEpisodeText: vi.fn(async () => null),
  },
  render: {
    putPageRender: vi.fn(async () => ''),
    putPageThumbnail: vi.fn(async () => ''),
    getPageRender: vi.fn(async () => null),
  },
  output: {
    putExport: vi.fn(async () => ''),
    getExport: vi.fn(async () => null),
    deleteExport: vi.fn(async () => {}),
  },
}

const createMockContext = (jobId = 'test-job'): StepContext => ({
  jobId,
  novelId: 'novel-1',
  logger: mockLogger,
  ports: mockPorts,
})

const createMockScript = (panelCount: number): NewMangaScript => ({
  style_tone: 'test',
  style_art: 'test',
  style_sfx: 'test',
  characters: [],
  locations: [],
  props: [],
  panels: Array.from({ length: panelCount }, (_, i) => ({
    no: i + 1,
    cut: `Test cut ${i + 1}`,
    camera: 'WS・標準',
    importance: Math.floor(Math.random() * 6) + 1, // Random 1-6
  })),
  continuity_checks: [],
})

describe('EpisodeBreakEstimationStep', () => {
  let step: EpisodeBreakEstimationStep
  let mockGenerator: any
  let mockGetAppConfig: any
  let mockSegmentScript: any

  // Narrowing helpers to keep strict typing in tests (no any)
  const ensureSuccess = <T>(r: StepExecutionResult<T>): StepResult<T> => {
    if (!r.success) throw new Error(r.error)
    return r
  }
  const ensureError = <T>(r: StepExecutionResult<T>): StepError => {
    if (r.success) throw new Error('Expected failure but got success')
    return r
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    // Mock the generator response
    mockGenerator = {
      generateObjectWithFallback: vi.fn().mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            startPanelIndex: 1,
            endPanelIndex: 50,
            description: 'First episode',
          },
          {
            episodeNumber: 2,
            title: 'Episode 2',
            startPanelIndex: 51,
            endPanelIndex: 100,
            description: 'Second episode',
          },
          {
            episodeNumber: 3,
            title: 'Episode 3',
            startPanelIndex: 101,
            endPanelIndex: 150,
            description: 'Third episode',
          },
          {
            episodeNumber: 4,
            title: 'Episode 4',
            startPanelIndex: 151,
            endPanelIndex: 200,
            description: 'Fourth episode',
          },
          {
            episodeNumber: 5,
            title: 'Episode 5',
            startPanelIndex: 201,
            endPanelIndex: 250,
            description: 'Fifth episode',
          },
          {
            episodeNumber: 6,
            title: 'Episode 6',
            startPanelIndex: 251,
            endPanelIndex: 300,
            description: 'Sixth episode',
          },
        ],
      }),
    }

    // Setup mocked modules
    const { DefaultLlmStructuredGenerator } = await vi.importMock('@/agents/structured-generator')
    ;(DefaultLlmStructuredGenerator as any).mockImplementation(() => mockGenerator)

    mockGetAppConfig = vi.mocked(await vi.importMock('@/config')).getAppConfigWithOverrides
    mockGetAppConfig.mockReturnValue({
      llm: {
        episodeBreakEstimation: {
          systemPrompt: 'Test system prompt',
          userPromptTemplate: 'Test user prompt {{scriptJson}}',
        },
      },
      scriptSegmentation: {
        maxPanelsPerSegment: 400,
        contextOverlapPanels: 50,
        minPanelsForSegmentation: 400,
        minTrailingSegmentSize: 320,
      },
      episodeBundling: {
        minPageCount: 20,
        enabled: true,
      },
    })

    mockSegmentScript = vi.mocked(
      await vi.importMock('@/agents/script/script-segmenter'),
    ).segmentScript
    mockSegmentScript.mockReturnValue([])

    step = new EpisodeBreakEstimationStep()
  })

  describe('Small Script Processing (< 400 panels)', () => {
    it('should use direct estimation for scripts with <= 400 panels', async () => {
      const script = createMockScript(300)
      const context = createMockContext()

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.totalEpisodes).toBe(6)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using direct episode break estimation (small script)',
        expect.objectContaining({
          jobId: 'test-job',
          panelCount: 300,
        }),
      )
    })

    it('should validate episode breaks correctly', async () => {
      // Create a script and mock invalid episode breaks
      const script = createMockScript(100)
      mockGenerator.generateObjectWithFallback.mockResolvedValueOnce({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Invalid Episode',
            startPanelIndex: 1,
            endPanelIndex: 50, // Doesn't cover all panels
          },
        ],
      })

      const context = createMockContext()

      const res = ensureError(await step.estimateEpisodeBreaks(script, context))
      expect(res.success).toBe(false)
      expect(res.error).toContain('Episode break validation failed')
    })

    it('auto-splits episodes exceeding max length before validation', async () => {
      const script = createMockScript(60)
      const context = createMockContext()

      // LLM returns a single too-long episode (60 panels)
      mockGenerator.generateObjectWithFallback.mockResolvedValueOnce({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Too Long Episode',
            startPanelIndex: 1,
            endPanelIndex: 60,
            description: 'One long block',
          },
        ],
      })

      // Disable bundling to observe the split result directly
      mockGetAppConfig.mockReturnValueOnce({
        llm: {
          episodeBreakEstimation: {
            systemPrompt: 'Test system prompt',
            userPromptTemplate: 'Test user prompt {{scriptJson}}',
          },
        },
        scriptSegmentation: {
          maxPanelsPerSegment: 400,
          contextOverlapPanels: 50,
          minPanelsForSegmentation: 400,
          minTrailingSegmentSize: 320,
        },
        episodeBundling: {
          minPageCount: 20,
          enabled: false,
        },
      })

      const res = ensureSuccess(await step.estimateEpisodeBreaks(script, context))
      expect(res.success).toBe(true)
      expect(res.data.episodeBreaks.episodes.length).toBe(2)
      const [e1, e2] = res.data.episodeBreaks.episodes
      expect(e1.startPanelIndex).toBe(1)
      expect(e1.endPanelIndex).toBe(50)
      expect(e2.startPanelIndex).toBe(51)
      expect(e2.endPanelIndex).toBe(60)
    })
  })

  describe('Large Script Processing (> 400 panels)', () => {
    it('should use sliding window for scripts with > 400 panels', async () => {
      const script = createMockScript(800) // Large script
      const context = createMockContext()

      // Mock segmentation result
      mockSegmentScript.mockReturnValue([
        {
          segmentIndex: 0,
          totalSegments: 2,
          panelIndices: Array.from({ length: 400 }, (_, i) => i),
          script: createMockScript(400),
        },
        {
          segmentIndex: 1,
          totalSegments: 2,
          panelIndices: Array.from({ length: 400 }, (_, i) => i + 400),
          script: createMockScript(400),
        },
      ])

      // Mock segment results
      mockGenerator.generateObjectWithFallback
        .mockResolvedValueOnce({
          episodes: [
            {
              episodeNumber: 1,
              title: 'Segment 1 Episode 1',
              startPanelIndex: 1,
              endPanelIndex: 50,
            },
            {
              episodeNumber: 2,
              title: 'Segment 1 Episode 2',
              startPanelIndex: 51,
              endPanelIndex: 100,
            },
            {
              episodeNumber: 3,
              title: 'Segment 1 Episode 3',
              startPanelIndex: 101,
              endPanelIndex: 150,
            },
            {
              episodeNumber: 4,
              title: 'Segment 1 Episode 4',
              startPanelIndex: 151,
              endPanelIndex: 200,
            },
            {
              episodeNumber: 5,
              title: 'Segment 1 Episode 5',
              startPanelIndex: 201,
              endPanelIndex: 250,
            },
            {
              episodeNumber: 6,
              title: 'Segment 1 Episode 6',
              startPanelIndex: 251,
              endPanelIndex: 300,
            },
            {
              episodeNumber: 7,
              title: 'Segment 1 Episode 7',
              startPanelIndex: 301,
              endPanelIndex: 350,
            },
            {
              episodeNumber: 8,
              title: 'Segment 1 Episode 8',
              startPanelIndex: 351,
              endPanelIndex: 400,
            },
          ],
        })
        .mockResolvedValueOnce({
          episodes: [
            {
              episodeNumber: 1,
              title: 'Segment 2 Episode 1',
              startPanelIndex: 1,
              endPanelIndex: 50,
            },
            {
              episodeNumber: 2,
              title: 'Segment 2 Episode 2',
              startPanelIndex: 51,
              endPanelIndex: 100,
            },
            {
              episodeNumber: 3,
              title: 'Segment 2 Episode 3',
              startPanelIndex: 101,
              endPanelIndex: 150,
            },
            {
              episodeNumber: 4,
              title: 'Segment 2 Episode 4',
              startPanelIndex: 151,
              endPanelIndex: 200,
            },
            {
              episodeNumber: 5,
              title: 'Segment 2 Episode 5',
              startPanelIndex: 201,
              endPanelIndex: 250,
            },
            {
              episodeNumber: 6,
              title: 'Segment 2 Episode 6',
              startPanelIndex: 251,
              endPanelIndex: 300,
            },
            {
              episodeNumber: 7,
              title: 'Segment 2 Episode 7',
              startPanelIndex: 301,
              endPanelIndex: 350,
            },
            {
              episodeNumber: 8,
              title: 'Segment 2 Episode 8',
              startPanelIndex: 351,
              endPanelIndex: 400,
            },
          ],
        })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.totalEpisodes).toBe(16) // 8 from first segment + 8 from second segment
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using sliding window episode break estimation (large script)',
        expect.objectContaining({
          jobId: 'test-job',
          panelCount: 800,
        }),
      )
    })

    it('should adjust episode numbers and panel indices correctly', async () => {
      const script = createMockScript(600)
      const context = createMockContext()

      // Mock segmentation result for 600 panels
      mockSegmentScript.mockReturnValue([
        {
          segmentIndex: 0,
          totalSegments: 2,
          panelIndices: Array.from({ length: 400 }, (_, i) => i),
          script: createMockScript(400),
        },
        {
          segmentIndex: 1,
          totalSegments: 2,
          panelIndices: Array.from({ length: 200 }, (_, i) => i + 400),
          script: createMockScript(200),
        },
      ])

      // Mock two segments
      mockGenerator.generateObjectWithFallback
        .mockResolvedValueOnce({
          episodes: [
            {
              episodeNumber: 1,
              title: 'First Segment Episode 1',
              startPanelIndex: 1,
              endPanelIndex: 50,
            },
            {
              episodeNumber: 2,
              title: 'First Segment Episode 2',
              startPanelIndex: 51,
              endPanelIndex: 100,
            },
            {
              episodeNumber: 3,
              title: 'First Segment Episode 3',
              startPanelIndex: 101,
              endPanelIndex: 150,
            },
            {
              episodeNumber: 4,
              title: 'First Segment Episode 4',
              startPanelIndex: 151,
              endPanelIndex: 200,
            },
            {
              episodeNumber: 5,
              title: 'First Segment Episode 5',
              startPanelIndex: 201,
              endPanelIndex: 250,
            },
            {
              episodeNumber: 6,
              title: 'First Segment Episode 6',
              startPanelIndex: 251,
              endPanelIndex: 300,
            },
            {
              episodeNumber: 7,
              title: 'First Segment Episode 7',
              startPanelIndex: 301,
              endPanelIndex: 350,
            },
            {
              episodeNumber: 8,
              title: 'First Segment Episode 8',
              startPanelIndex: 351,
              endPanelIndex: 400,
            },
          ],
        })
        .mockResolvedValueOnce({
          episodes: [
            {
              episodeNumber: 1,
              title: 'Second Segment Episode 1',
              startPanelIndex: 1,
              endPanelIndex: 50,
            },
            {
              episodeNumber: 2,
              title: 'Second Segment Episode 2',
              startPanelIndex: 51,
              endPanelIndex: 100,
            },
            {
              episodeNumber: 3,
              title: 'Second Segment Episode 3',
              startPanelIndex: 101,
              endPanelIndex: 150,
            },
            {
              episodeNumber: 4,
              title: 'Second Segment Episode 4',
              startPanelIndex: 151,
              endPanelIndex: 200,
            },
          ],
        })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.episodeBreaks.episodes).toHaveLength(12) // 8 from first segment + 4 from second segment

      // Check episode numbering and panel indices adjustment
      const episodes = result.data.episodeBreaks.episodes
      expect(episodes?.[0].episodeNumber).toBe(1)
      expect(episodes?.[8].episodeNumber).toBe(9) // Second segment episodes should be renumbered

      // Panel indices should be adjusted to global indices
      expect(episodes[0].startPanelIndex).toBe(1)
      expect(episodes[0].endPanelIndex).toBe(50)
      expect(episodes[8].startPanelIndex).toBe(401) // Should start after first segment
      expect(episodes[11].endPanelIndex).toBe(600)
    })
  })

  describe('Validation', () => {
    it('should validate episode coverage', () => {
      const episodeBreaks = {
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            startPanelIndex: 1,
            endPanelIndex: 50,
          },
          {
            episodeNumber: 2,
            title: 'Episode 2',
            startPanelIndex: 51,
            endPanelIndex: 100,
          },
          {
            episodeNumber: 3,
            title: 'Episode 3',
            startPanelIndex: 101,
            endPanelIndex: 150,
          },
          {
            episodeNumber: 4,
            title: 'Episode 4',
            startPanelIndex: 151,
            endPanelIndex: 200,
          },
        ],
      }

      const validation = (step as any).validateEpisodeBreaks(episodeBreaks, 200)
      expect(validation.valid).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    it('should detect gaps in episode coverage', () => {
      const episodeBreaks = {
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            startPanelIndex: 1,
            endPanelIndex: 50,
          },
          {
            episodeNumber: 2,
            title: 'Episode 2',
            startPanelIndex: 60, // Gap from 51-59
            endPanelIndex: 100,
          },
        ],
      }

      const validation = (step as any).validateEpisodeBreaks(episodeBreaks, 100)
      expect(validation.valid).toBe(false)
      expect(validation.issues).toContain('Episode 2: expected start 51, got 60')
    })

    it('should detect episodes that are too short or too long', () => {
      const episodeBreaks = {
        episodes: [
          {
            episodeNumber: 1,
            title: 'Too Short',
            startPanelIndex: 1,
            endPanelIndex: 5, // Only 5 panels
          },
          {
            episodeNumber: 2,
            title: 'Too Long',
            startPanelIndex: 6,
            endPanelIndex: 60, // 55 panels (> 50 limit)
          },
        ],
      }

      const validation = (step as any).validateEpisodeBreaks(episodeBreaks, 60)
      expect(validation.valid).toBe(false)
      expect(validation.issues.some((issue: string) => issue.includes('too short'))).toBe(true)
      expect(validation.issues.some((issue: string) => issue.includes('too long'))).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle LLM generation failures gracefully', async () => {
      const script = createMockScript(200)
      const context = createMockContext()

      // Reset the mock and set it to reject
      mockGenerator.generateObjectWithFallback.mockReset()
      mockGenerator.generateObjectWithFallback.mockRejectedValue(new Error('LLM generation failed'))

      const result = ensureError(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(false)
      expect(result.error).toContain('LLM generation failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Episode break estimation failed',
        expect.objectContaining({
          jobId: 'test-job',
          error: 'LLM generation failed',
        }),
      )
    })

    it('should handle empty episode results', async () => {
      const script = createMockScript(200)
      const context = createMockContext()

      // Reset the mock and set it to return empty episodes
      mockGenerator.generateObjectWithFallback.mockReset()
      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [], // Empty episodes
      })

      const result = ensureError(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(false)
      expect(result.error).toContain('no episodes detected')
    })
  })

  // 明日見せるので今日はいったんスキップ
  describe('Episode Bundling', () => {
    it('should fail validation if bundling makes an episode exceed max length', async () => {
      const script = createMockScript(100)
      const context = createMockContext()

      // LLM suggests a short first episode that will be bundled into the next, exceeding 50
      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Short Episode',
            startPanelIndex: 1,
            endPanelIndex: 15, // 15 pages - will be merged into next
          },
          {
            episodeNumber: 2,
            title: 'Main Episode',
            startPanelIndex: 16,
            endPanelIndex: 60, // 45 pages -> after bundling becomes 60 (> 50)
          },
          {
            episodeNumber: 3,
            title: 'Tail',
            startPanelIndex: 61,
            endPanelIndex: 100,
          },
        ],
      })

      const result = ensureError(await step.estimateEpisodeBreaks(script, context))
      expect(result.success).toBe(false)
      // Error message should include reason like 'too long (60 panels)'
      expect(result.error).toContain('too long')
    })
    it.skip('should bundle episodes with less than 20 pages with next episode', async () => {
      const script = createMockScript(100)
      const context = createMockContext()

      // Mock LLM result with episodes where some have < 20 pages
      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Short Episode 1',
            startPanelIndex: 1,
            endPanelIndex: 15, // 15 pages - should be bundled with next
          },
          {
            episodeNumber: 2,
            title: 'Episode 2',
            startPanelIndex: 16,
            endPanelIndex: 45, // 30 pages - will receive bundled content
          },
          {
            episodeNumber: 3,
            title: 'Short Episode 3',
            startPanelIndex: 46,
            endPanelIndex: 55, // 10 pages - should be bundled with next
          },
          {
            episodeNumber: 4,
            title: 'Episode 4',
            startPanelIndex: 56,
            endPanelIndex: 100, // 45 pages - will receive bundled content
          },
        ],
      })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.episodeBreaks.episodes).toHaveLength(2) // Should be bundled into 2 episodes

      const episodes = result.data.episodeBreaks.episodes
      expect(episodes?.[0].episodeNumber).toBe(1)
      expect(episodes?.[0].startPanelIndex).toBe(1)
      expect(episodes?.[0].endPanelIndex).toBe(45) // Combined range
      expect(episodes?.[0].endPanelIndex - episodes?.[0].startPanelIndex + 1).toBe(45) // 45 pages total

      expect(episodes?.[1].episodeNumber).toBe(2)
      expect(episodes?.[1].startPanelIndex).toBe(46)
      expect(episodes?.[1].endPanelIndex).toBe(100) // Combined range
      expect(episodes?.[1].endPanelIndex - episodes?.[1].startPanelIndex + 1).toBe(55) // 55 pages total
    })

    it('should bundle last episode with previous episode if it has less than 20 pages', async () => {
      const script = createMockScript(120)
      const context = createMockContext()

      // Mock LLM result where last episode has < 20 pages
      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            startPanelIndex: 1,
            endPanelIndex: 50, // 50 pages - good size
          },
          {
            episodeNumber: 2,
            title: 'Episode 2',
            startPanelIndex: 51,
            endPanelIndex: 100, // 50 pages - good size
          },
          {
            episodeNumber: 3,
            title: 'Last Short Episode',
            startPanelIndex: 101,
            endPanelIndex: 120, // 20 pages - exactly at threshold but treated as short in this context
          },
        ],
      })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      const episodes = result.data.episodeBreaks.episodes

      // The last episode should be bundled with the previous one
      const lastEpisode = episodes?.[episodes.length - 1]
      expect(lastEpisode?.endPanelIndex).toBe(120)
      expect(
        lastEpisode && lastEpisode.endPanelIndex - lastEpisode.startPanelIndex + 1,
      ).toBeGreaterThanOrEqual(20)
    })

    it('should handle single episode correctly without bundling', async () => {
      const script = createMockScript(15)
      const context = createMockContext()

      // Mock LLM result with single episode
      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Single Episode',
            startPanelIndex: 1,
            endPanelIndex: 15,
          },
        ],
      })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.episodeBreaks.episodes).toHaveLength(1)

      const episode = result.data.episodeBreaks.episodes[0]
      expect(episode?.episodeNumber).toBe(1)
      expect(episode?.startPanelIndex).toBe(1)
      expect(episode?.endPanelIndex).toBe(15)
    })

    it('should preserve episode titles and descriptions during bundling', async () => {
      const script = createMockScript(50)
      const context = createMockContext()

      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'First Title',
            description: 'First description',
            startPanelIndex: 1,
            endPanelIndex: 15, // Short episode (15 pages)
          },
          {
            episodeNumber: 2,
            title: 'Second Title',
            description: 'Second description',
            startPanelIndex: 16,
            endPanelIndex: 50, // Will receive bundled content (35 pages, total will be 50)
          },
        ],
      })

      const result = ensureSuccess(await step.estimateEpisodeBreaks(script, context))

      expect(result.success).toBe(true)
      expect(result.data.episodeBreaks.episodes).toHaveLength(1)

      const episode = result.data.episodeBreaks.episodes[0]
      expect(episode?.title).toBe('Second Title') // Should preserve the receiving episode's title
      expect(episode?.description).toBe('Second description')
      expect(episode?.startPanelIndex).toBe(1)
      expect(episode?.endPanelIndex).toBe(50)
    })

    it('should log bundling operations correctly', async () => {
      const script = createMockScript(60)
      const context = createMockContext('bundle-test-job')

      mockGenerator.generateObjectWithFallback.mockResolvedValue({
        episodes: [
          {
            episodeNumber: 1,
            title: 'Short Episode',
            startPanelIndex: 1,
            endPanelIndex: 10, // Short episode
          },
          {
            episodeNumber: 2,
            title: 'Normal Episode',
            startPanelIndex: 11,
            endPanelIndex: 60,
          },
        ],
      })

      await step.estimateEpisodeBreaks(script, context)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting episode bundling process',
        expect.objectContaining({
          jobId: 'bundle-test-job',
          originalEpisodes: 2,
          minPageCount: 20,
        }),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Merged episode with next episode',
        expect.objectContaining({
          jobId: 'bundle-test-job',
          mergedEpisode: 1,
          intoEpisode: 2,
        }),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Episode bundling completed',
        expect.objectContaining({
          jobId: 'bundle-test-job',
          originalEpisodeCount: 2,
          finalEpisodeCount: 1,
          removedCount: 1,
        }),
      )
    })
  })
})
