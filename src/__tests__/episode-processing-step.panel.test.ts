import { describe, expect, it, vi } from 'vitest'
import { EpisodeProcessingStep } from '@/services/application/steps/episode-processing-step'
import type { EpisodeBreakPlan, NewMangaScript } from '@/types/script'

// Minimal storage mocks (storeEpisodeText uses dynamic import & transaction manager)
vi.mock('@/services/application/transaction-manager', () => ({
  executeStorageWithDbOperation: async ({ storage, key, value }: any) => {
    await storage.put(key, value, { metadata: {} })
  },
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getAnalysisStorage: async () => ({
      put: async () => {},
    }),
  },
  StorageKeys: {
    episodeText: ({ novelId, jobId, episodeNumber }: any) => `${novelId}/jobs/${jobId}/analysis/episode_${episodeNumber}.txt`,
  },
}))

describe('EpisodeProcessingStep (panel index mode)', () => {
  const buildScript = (): NewMangaScript => ({
    style_tone: 't',
    style_art: 'a',
    style_sfx: 's',
    characters: [],
    locations: [],
    props: [],
    continuity_checks: [],
    panels: [
      { no: 1, cut: 'cut1', camera: 'cam1', narration: ['冒頭'], dialogue: [{ type: 'speech', text: 'こんにちは', speaker: 'A' }], sfx: ['ゴゴゴ'], importance: 3 },
      { no: 2, cut: 'cut2', camera: 'cam2', dialogue: [{ type: 'thought', text: '考えている', speaker: 'B' }], importance: 2 },
      { no: 3, cut: 'cut3', camera: 'cam3', narration: ['説明'], importance: 1 },
    ],
  })

  const breaks: EpisodeBreakPlan = {
    episodes: [
      { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 2, title: 'Ep1' },
      { episodeNumber: 2, startPanelIndex: 3, endPanelIndex: 3, title: 'Ep2' },
    ],
  }

  const context = {
    jobId: 'job1',
    novelId: 'novel1',
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  } as any

  it('builds episode text from panels (episode 1)', async () => {
    const step = new EpisodeProcessingStep()
    const script = buildScript()
  const result = await step.extractEpisodeTextFromPanels(script, breaks, 1, context)
  expect(result.success).toBe(true)
  if (!result.success) throw new Error('unexpected')
  const text = result.data.episodeText
    expect(text).toMatch('冒頭')
    expect(text).toMatch('A: こんにちは')
    expect(text).toMatch('[thought] 考えている')
    expect(text).toMatch('[SFX] ゴゴゴ')
  })

  it('builds episode text from panels (episode 2)', async () => {
    const step = new EpisodeProcessingStep()
    const script = buildScript()
  const result = await step.extractEpisodeTextFromPanels(script, breaks, 2, context)
  expect(result.success).toBe(true)
  if (!result.success) throw new Error('unexpected')
  const text = result.data.episodeText.trim()
    expect(text).toBe('説明')
  })

  it('fails on invalid episode number', async () => {
    const step = new EpisodeProcessingStep()
    const script = buildScript()
    const result = await step.extractEpisodeTextFromPanels(script, breaks, 99, context)
    expect(result.success).toBe(false)
  })

  it('fails on invalid range', async () => {
    const step = new EpisodeProcessingStep()
    const script = buildScript()
    const badBreaks: EpisodeBreakPlan = { episodes: [{ episodeNumber: 1, startPanelIndex: 0, endPanelIndex: 1 }] as any }
    const result = await step.extractEpisodeTextFromPanels(script, badBreaks, 1, context)
    expect(result.success).toBe(false)
  })
})
