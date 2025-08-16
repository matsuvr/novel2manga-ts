import yaml from 'js-yaml'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Agent } from '@/agents/agent'
import { PageSplitAgent } from '@/agents/page-splitter'
import type { StoragePorts } from '@/infrastructure/storage/ports'
import { generateEpisodeLayout } from '@/services/application/layout-generation'
import { loadSampleTemplatesByCount } from '@/utils/panel-sample-loader'

// Mock repository adapters to avoid real DB access
vi.mock('@/repositories/adapters', () => ({
  adaptAll: (_db: unknown) => ({
    episode: {
      async getByJobId(_jobId: string) {
        // No existing episodes; force demo path in service
        return []
      },
    },
    job: {
      async getJobWithProgress(_jobId: string) {
        return {
          id: 'job-1',
          novelId: 'novel-1',
          jobName: 'Test Job',
          status: 'pending',
          currentStep: 'split',
          processedChunks: 0,
          totalChunks: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          progress: null,
        }
      },
      async updateStep(_jobId: string, _step: string) {
        return
      },
      async markStepCompleted(_jobId: string, _step: string) {
        return
      },
    },
  }),
}))

describe('Service integration: generateEpisodeLayout (counts-only + template snap)', () => {
  const originalEnv = { ...process.env }

  const writes: {
    progress?: { key: string; json: string }
    yaml?: { key: string; yaml: string }
  } = {}

  let spyGenerate: ReturnType<typeof vi.spyOn>
  let spyPlan: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    process.env.NODE_ENV = 'test'
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'

    // Mock LLM to return panel counts only
    spyGenerate = vi
      .spyOn(Agent.prototype as unknown as { generateObject: Function }, 'generateObject')
      .mockImplementation((_messages: unknown, _schema: unknown, opts?: { stepName?: string }) => {
        if (opts?.stepName === 'layout' || opts?.stepName === 'layout-plan') {
          return Promise.resolve({
            pages: [
              { pageNumber: 1, panelCount: 1 },
              { pageNumber: 2, panelCount: 6 },
            ],
          })
        }
        return Promise.resolve({ pages: [] })
      })

    // Mock page planner to return two pages starting at 1
    spyPlan = vi
      .spyOn(PageSplitAgent.prototype, 'planNextBatch')
      .mockResolvedValue({
        episodeNumber: 1,
        startPage: 1,
        plannedPages: [
          {
            pageNumber: 1,
            summary: 'impact',
            importance: 9,
            segments: [
              { contentHint: 'impact', importance: 9, source: { chunkIndex: 0, startOffset: 0, endOffset: 5 } },
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
      })
  })

  afterAll(() => {
    spyGenerate?.mockRestore()
    spyPlan?.mockRestore()
    process.env = originalEnv
  })

  it('writes progress JSON and YAML snapshots with expected panel templates', async () => {
    // In-memory storage ports capturing progress/YAML
    const ports: StoragePorts = {
      novel: {
        async getNovelText() {
          return null
        },
        async putNovelText() {
          return 'novel.json'
        },
      },
      chunk: {
        async getChunk() {
          return { text: 'chunk text' }
        },
        async putChunk() {
          return 'chunk.txt'
        },
      },
      analysis: {
        async getAnalysis() {
          // Not used in demo path
          return { text: '{}' }
        },
        async putAnalysis() {
          return 'analysis.json'
        },
      },
      layout: {
        async putEpisodeLayout(jobOrKey, episodeNumberOrContent, yamlOrContent) {
          // Handle both old signature and new temporary file signature
          if (typeof episodeNumberOrContent === 'string' && yamlOrContent !== undefined) {
            // New 3-param temporary file signature: putEpisodeLayout(tempKey, '', yamlContent)
            const key = jobOrKey as string
            const yaml = yamlOrContent as string
            if (key.includes('temp_')) {
              // Temporary file - don't track for assertion
              return key
            }
            writes.yaml = { key, yaml }
            return key
          } else {
            // Old signature: putEpisodeLayout(jobId, episodeNumber, yaml)
            const jobId = jobOrKey as string
            const episodeNumber = episodeNumberOrContent as number
            const yaml = yamlOrContent as string
            writes.yaml = { key: `${jobId}/episode_${episodeNumber}.yaml`, yaml }
            return writes.yaml.key
          }
        },
        async getEpisodeLayout() {
          return null
        },
        async putEpisodeLayoutProgress(jobOrKey, episodeNumberOrContent, content) {
          // Handle both old signature and new temporary file signature
          if (typeof episodeNumberOrContent === 'string' && content === undefined) {
            // New temporary file signature: putEpisodeLayoutProgress(tempKey, '', json)
            const key = jobOrKey as string
            const json = episodeNumberOrContent
            if (key.includes('temp_')) {
              // Temporary file - don't track for assertion
              return key
            }
            writes.progress = { key, json }
            return key
          } else if (typeof episodeNumberOrContent === 'string' && typeof content === 'string') {
            // New 3-param temporary file signature: putEpisodeLayoutProgress(tempKey, '', json)
            const key = jobOrKey as string
            const json = content
            if (key.includes('temp_')) {
              // Temporary file - don't track for assertion
              return key
            }
            writes.progress = { key, json }
            return key
          } else {
            // Old signature: putEpisodeLayoutProgress(jobId, episodeNumber, json)
            const jobId = jobOrKey as string
            const episodeNumber = episodeNumberOrContent as number
            const json = content as string
            writes.progress = {
              key: `${jobId}/episode_${episodeNumber}.progress.json`,
              json,
            }
            return writes.progress.key
          }
        },
        async getEpisodeLayoutProgress() {
          return null
        },
      },
      render: {
        async putPageRender() {
          return 'render.png'
        },
        async putPageThumbnail() {
          return 'thumb.jpg'
        },
        async getPageRender() {
          return null
        },
      },
      output: {
        async putExport() {
          return 'output.zip'
        },
        async getExport() {
          return { text: '' }
        },
      },
    }

    const jobId = 'job-1'
    const episodeNumber = 1
    const result = await generateEpisodeLayout(jobId, episodeNumber, { isDemo: true }, ports)

    // Assert snapshots were written
    expect(writes.progress?.key).toBe(`${jobId}/episode_${episodeNumber}.progress.json`)
    expect(writes.yaml?.key).toBe(`${jobId}/episode_${episodeNumber}.yaml`)
    expect(typeof writes.progress?.json).toBe('string')
    expect(typeof writes.yaml?.yaml).toBe('string')

    // YAML parse and panel counts
    const parsed = yaml.load(writes.yaml!.yaml) as {
      pages: Array<{ page_number: number; panels: Array<{ position: { x: number; y: number }; size: { width: number; height: number } }> }>
    }
    expect(Array.isArray(parsed.pages)).toBe(true)
    const p1 = parsed.pages.find((p) => p.page_number === 1)!
    const p2 = parsed.pages.find((p) => p.page_number === 2)!
    expect(p1.panels.length).toBe(1)
    expect(p2.panels.length).toBe(6)

    // Verify geometries match embedded templates
    const sig = (panels: { position: { x: number; y: number }; size: { width: number; height: number } }[]) =>
      panels.map((pp) => `${pp.position.x}:${pp.position.y}:${pp.size.width}:${pp.size.height}`).join('|')
    const t1 = loadSampleTemplatesByCount(1)
    const t6 = loadSampleTemplatesByCount(6)
    expect(t1.map((t) => sig(t.panels)).includes(sig(p1.panels))).toBe(true)
    expect(t6.map((t) => sig(t.panels)).includes(sig(p2.panels))).toBe(true)

    // Service return contract
    expect(result.pageNumbers).toEqual([1, 2])
    expect(result.layout.pages.length).toBe(2)
  })
})

