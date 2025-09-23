import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { EpisodeProcessingStep } from '@/services/application/steps/episode-processing-step'
import { InvariantViolation, ValidationError } from '@/types/errors/episode-error'
import type { EpisodeBreakPlan, NewMangaScript } from '@/types/script'

// Reuse existing mocks for storage / transaction manager
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

const context = {
  jobId: 'jobEff1',
  novelId: 'novelEff1',
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
} as any

const buildScript = (): NewMangaScript => ({
  style_tone: 't',
  style_art: 'a',
  style_sfx: 's',
  characters: [],
  locations: [],
  props: [],
  continuity_checks: [],
  panels: [
    { no: 1, cut: 'c1', camera: 'cam1', narration: ['N1'], dialogue: [{ type: 'speech', text: 'Hi', speaker: 'A' }], importance: 1 },
    { no: 2, cut: 'c2', camera: 'cam2', dialogue: [{ type: 'thought', text: 'Think', speaker: 'B' }], importance: 1 },
  ],
})

describe('EpisodeProcessingStep Effect API', () => {
  const breaks: EpisodeBreakPlan = {
    episodes: [
      { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 2, title: 'Ep1' },
    ],
  }

  it('succeeds via Effect core method', async () => {
    const step = new EpisodeProcessingStep()
    const eff = step.extractEpisodeTextFromPanelsEffect(buildScript(), breaks, 1, context)
    const value = await Effect.runPromise(eff)
    expect(value.episodeText).toMatch('N1')
    expect(value.episodeText).toMatch('A: Hi')
  })

  it('fails with ValidationError for unknown episode', async () => {
    const step = new EpisodeProcessingStep()
    const eff = step.extractEpisodeTextFromPanelsEffect(buildScript(), breaks, 999, context)
    const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') {
      expect(either.left).toBeInstanceOf(ValidationError)
    }
  })

  it('fails with InvariantViolation when empty text produced', async () => {
    const step = new EpisodeProcessingStep()
    // script with panels but all blank
    const script: NewMangaScript = { ...buildScript(), panels: [{ no: 1, cut: 'c', camera: 'c' }] as any }
    const br: EpisodeBreakPlan = { episodes: [{ episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 1 }] as any }
    const eff = step.extractEpisodeTextFromPanelsEffect(script, br, 1, context)
    const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') {
      expect(either.left).toBeInstanceOf(InvariantViolation)
    }
  })
})
