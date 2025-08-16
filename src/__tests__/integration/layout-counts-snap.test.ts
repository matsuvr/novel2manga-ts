import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Agent } from '@/agents/agent'
import { generateMangaLayoutForPlan } from '@/agents/layout-generator'
import type { PageBatchPlan } from '@/types/page-splitting'
import type { EpisodeData } from '@/types/panel-layout'
import { loadSampleTemplatesByCount } from '@/utils/panel-sample-loader'

describe('Layout generation: counts-only + template snap', () => {
  const originalEnv = { ...process.env }
  let spy: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    process.env.NODE_ENV = 'test'
    // Ensure provider initialization does not throw
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'
    // Mock LLM structured output to return only panel counts
    spy = vi
      .spyOn(Agent.prototype as unknown as { generateObject: Function }, 'generateObject')
      .mockImplementation((_messages: unknown, _schema: unknown, opts?: { stepName?: string }) => {
        // Both 'layout' and 'layout-plan' should return the same test counts
        if (opts?.stepName === 'layout' || opts?.stepName === 'layout-plan') {
          return Promise.resolve({
            pages: [
              { pageNumber: 1, panelCount: 1 },
              { pageNumber: 2, panelCount: 6 },
            ],
          })
        }
        // Default minimal safe value
        return Promise.resolve({ pages: [] })
      })
  })

  afterAll(() => {
    spy?.mockRestore()
    process.env = originalEnv
  })

  it('applies a random embedded template matching each panel count', async () => {
    // Minimal EpisodeData with two chunks
    const episodeData: EpisodeData = {
      chunkAnalyses: [
        {
          chunkIndex: 0,
          characters: [{ name: 'A', role: 'p', description: '' }],
          scenes: [
            {
              id: 's1',
              location: 'loc',
              time: 'day',
              description: 'desc',
              startIndex: 0,
              endIndex: 1,
            },
          ],
          dialogues: [],
          highlights: [],
          situations: [],
          summary: 'sum0',
        },
      ],
      author: 'Tester',
      title: 'Episode 1',
      episodeNumber: 1,
      episodeTitle: 'Ep1',
      episodeSummary: 'Summary',
      startChunk: 0,
      startCharIndex: 0,
      endChunk: 0,
      endCharIndex: 10,
      estimatedPages: 2,
      chunks: [
        {
          chunkIndex: 0,
          text: 'hello',
          analysis: {
            chunkIndex: 0,
            characters: [{ name: 'A', role: 'p', description: '' }],
            scenes: [
              {
                id: 's1',
                location: 'loc',
                time: 'day',
                description: 'desc',
                startIndex: 0,
                endIndex: 1,
              },
            ],
            dialogues: [],
            highlights: [],
            situations: [],
            summary: 'sum0',
          },
          isPartial: false,
          startOffset: 0,
          endOffset: 5,
        },
      ],
    }

    const plan: PageBatchPlan = {
      episodeNumber: 1,
      startPage: 1,
      plannedPages: [
        {
          pageNumber: 1,
          summary: 'impact',
          importance: 9,
          segments: [
            {
              contentHint: 'impact scene',
              importance: 9,
              source: { chunkIndex: 0, startOffset: 0, endOffset: 5 },
            },
          ],
        },
        {
          pageNumber: 2,
          summary: 'dialogue',
          importance: 3,
          segments: [
            { contentHint: 'talk', importance: 3, source: { chunkIndex: 0, startOffset: 0, endOffset: 5 } },
          ],
        },
      ],
      mayAdjustPreviousPages: false,
      remainingPagesEstimate: 0,
    }

    const layout = await generateMangaLayoutForPlan(episodeData, plan)
    expect(Array.isArray(layout.pages)).toBe(true)
    expect(layout.pages.length).toBe(2)

    const p1 = layout.pages.find((p) => p.page_number === 1)!
    const p2 = layout.pages.find((p) => p.page_number === 2)!
    expect(p1.panels.length).toBe(1)
    expect(p2.panels.length).toBe(6)

    // Verify geometries match one of the embedded templates for each count
    const sig = (panels: { position: { x: number; y: number }; size: { width: number; height: number } }[]) =>
      panels.map((pp) => `${pp.position.x}:${pp.position.y}:${pp.size.width}:${pp.size.height}`).join('|')

    const t1 = loadSampleTemplatesByCount(1)
    const t6 = loadSampleTemplatesByCount(6)
    const s1 = sig(p1.panels)
    const s6 = sig(p2.panels)
    expect(t1.map((t) => sig(t.panels)).includes(s1)).toBe(true)
    expect(t6.map((t) => sig(t.panels)).includes(s6)).toBe(true)
  })
})

