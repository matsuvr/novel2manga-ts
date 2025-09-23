import { Effect } from 'effect'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DrizzleEpisodePort } from '@/infrastructure/ports/drizzle-episode-port'
import { FileSystemScriptPort } from '@/infrastructure/ports/fs-script-port'

// Minimal mock for storage
vi.mock('@/utils/storage', async () => {
  const actual = await vi.importActual<object>('@/utils/storage')
  const memory = new Map<string, string>()
  return {
    ...(actual as object),
    getAnalysisStorage: async () => ({
      get: async (key: string) => (memory.has(key) ? { text: memory.get(key)! } : null),
    }),
    JsonStorageKeys: {
      scriptCombined: ({ novelId, jobId }: { novelId: string; jobId: string }) => `${novelId}/jobs/${jobId}/analysis/script_combined.json`,
    },
    __scriptMemory: memory,
  }
})

// Mock database services for DrizzleEpisodePort
vi.mock('@/services/database', () => {
  // Episode 型の最小部分のみ利用 (テスト内で必要なフィールド)
  interface TestEpisode {
    id: string
    novelId: string
    jobId: string
    episodeNumber: number
    title?: string | null
    summary?: string | null
    startChunk?: number
    startCharIndex?: number
    endChunk?: number
    endCharIndex?: number
    confidence?: number
    episodeTextPath?: string | null
  }
  const episodes: TestEpisode[] = []
  return {
    db: {
      episodes: () => ({
        getEpisode: async (jobId: string, episodeNumber: number) =>
          episodes.find((e) => e.jobId === jobId && e.episodeNumber === episodeNumber) || null,
        getEpisodesByJobId: async (jobId: string) => episodes.filter((e) => e.jobId === jobId),
        updateEpisodeTextPath: async (jobId: string, episodeNumber: number, path: string) => {
          const ep = episodes.find((e) => e.jobId === jobId && e.episodeNumber === episodeNumber)
          if (ep) ep.episodeTextPath = path
        },
      }),
    },
    __episodesMemory: episodes,
  }
})

describe('ScriptPort', () => {
  it('loads combined script successfully', async () => {
    const { __scriptMemory, JsonStorageKeys } = (await import('@/utils/storage')) as unknown as {
      __scriptMemory: Map<string, string>
      JsonStorageKeys: { scriptCombined: (p: { novelId: string; jobId: string }) => string }
    }
    const key = JsonStorageKeys.scriptCombined({ novelId: 'n1', jobId: 'j1' })
    __scriptMemory.set(
      key,
      JSON.stringify({
        style_tone: 't',
        style_art: 'a',
        style_sfx: 's',
        characters: [],
        locations: [],
        props: [],
        panels: [
          { no: 1, cut: 'c', camera: 'cam', narration: [], dialogue: [], importance: 3 },
        ],
        continuity_checks: [],
      }),
    )
    const port = new FileSystemScriptPort()
    const script = await Effect.runPromise(port.getCombinedScript({ novelId: 'n1', jobId: 'j1' }))
    expect(script.panels.length).toBe(1)
  })

  it('normalizes panel indices (removes invalid/duplicates and reindexes) - expects successful parse with valid subset', async () => {
    const { __scriptMemory, JsonStorageKeys } = (await import('@/utils/storage')) as unknown as {
      __scriptMemory: Map<string, string>
      JsonStorageKeys: { scriptCombined: (p: { novelId: string; jobId: string }) => string }
    }
    const key = JsonStorageKeys.scriptCombined({ novelId: 'n2', jobId: 'j2' })
    const rawObject = {
      style_tone: 't',
      style_art: 'a',
      style_sfx: 's',
      characters: [],
      locations: [],
      props: [],
      // Provide only valid (>=1) indices; duplicates will be normalized (3,2,2,5) -> becomes [1,2,3]
      panels: [
        { no: 3, cut: 'c', camera: 'cam', narration: [], dialogue: [], importance: 2 },
        { no: 2, cut: 'c', camera: 'cam', narration: [], dialogue: [], importance: 2 },
        { no: 2, cut: 'c', camera: 'cam', narration: [], dialogue: [], importance: 2 },
        { no: 5, cut: 'c', camera: 'cam', narration: [], dialogue: [], importance: 2 },
      ],
      continuity_checks: [],
      coverageStats: { coverageRatio: 1, missingPoints: [], overSummarized: false },
    }
    __scriptMemory.set(key, JSON.stringify(rawObject))
    const port = new FileSystemScriptPort()
    // Sanity: parse back to ensure JSON validity
    const stored = (__scriptMemory.get(key) as string) || ''
    JSON.parse(stored) // will throw if invalid
    const script = await Effect.runPromise(port.getCombinedScript({ novelId: 'n2', jobId: 'j2' }))
    expect(script.panels.map((p) => p.no)).toEqual([1, 2, 3])
    expect(script.panels.length).toBe(3)
  })
})

describe('EpisodePort', () => {
  beforeAll(async () => {
    const { __episodesMemory } = (await import('@/services/database')) as unknown as {
      __episodesMemory: Array<{ id: string; novelId: string; jobId: string; episodeNumber: number; title: string; summary: string; startChunk: number; startCharIndex: number; endChunk: number; endCharIndex: number; confidence: number; createdAt: string; episodeTextPath: string | null }>
    }
    __episodesMemory.push({
      id: 'e1',
      novelId: 'n1',
      jobId: 'j1',
      episodeNumber: 1,
      title: 't',
      summary: 's',
      startChunk: 0,
      startCharIndex: 0,
      endChunk: 0,
      endCharIndex: 0,
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      episodeTextPath: null,
    })
  })
  it('gets and updates episode text path', async () => {
    const port = new DrizzleEpisodePort()
    const ep = await Effect.runPromise(port.getEpisode('j1', 1))
    expect(ep.title).toBe('t')
    await Effect.runPromise(port.updateEpisodeTextPath('j1', 1, 'path.txt'))
    const updated = await Effect.runPromise(port.getEpisode('j1', 1))
    expect(updated.episodeTextPath).toBe('path.txt')
  })
})
