import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EpisodeBreakEstimationStep } from '@/services/application/steps/episode-break-estimation-step'
import type { NewMangaScript } from '@/types/script'
import type { StepContext } from '@/services/application/steps/base-step'

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

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}

const createMockContext = (jobId = 'test-job'): StepContext => ({
  jobId,
  logger: mockLogger,
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

      const result = await step.estimateEpisodeBreaks(script, context)

      expect(result.success).toBe(true)
      expect(result.data?.totalEpisodes).toBe(6)
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

      const res = await step.estimateEpisodeBreaks(script, context)
      expect(res.success).toBe(false)
      expect(res.error).toContain('Episode break validation failed')
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

      const result = await step.estimateEpisodeBreaks(script, context)

      expect(result.success).toBe(true)
      expect(result.data?.totalEpisodes).toBe(16) // 8 from first segment + 8 from second segment
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

      const result = await step.estimateEpisodeBreaks(script, context)

      expect(result.success).toBe(true)
      expect(result.data?.episodeBreaks.episodes).toHaveLength(12) // 8 from first segment + 4 from second segment

      // Check episode numbering and panel indices adjustment
      const episodes = result.data?.episodeBreaks.episodes
      expect(episodes?.[0].episodeNumber).toBe(1)
      expect(episodes?.[8].episodeNumber).toBe(9) // Second segment episodes should be renumbered

      // Panel indices should be adjusted to global indices
      expect(episodes?.[0].startPanelIndex).toBe(1)
      expect(episodes?.[0].endPanelIndex).toBe(50)
      expect(episodes?.[8].startPanelIndex).toBe(401) // Should start after first segment
      expect(episodes?.[11].endPanelIndex).toBe(600)
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
      expect(validation.issues.some((issue) => issue.includes('too short'))).toBe(true)
      expect(validation.issues.some((issue) => issue.includes('too long'))).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle LLM generation failures gracefully', async () => {
      const script = createMockScript(200)
      const context = createMockContext()

      // Reset the mock and set it to reject
      mockGenerator.generateObjectWithFallback.mockReset()
      mockGenerator.generateObjectWithFallback.mockRejectedValue(new Error('LLM generation failed'))

      const result = await step.estimateEpisodeBreaks(script, context)

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

      const result = await step.estimateEpisodeBreaks(script, context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('no episodes detected')
    })
  })
})
