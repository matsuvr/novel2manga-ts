import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleEpisodePort } from '@/infrastructure/ports/drizzle-episode-port'
import { FileSystemScriptPort } from '@/infrastructure/ports/fs-script-port'
import { DatabaseError, ExternalIOError } from '@/types/errors/episode-error'

// We will stub storage + database dynamic imports
vi.mock('@/utils/storage', async () => {
  const actual = await vi.importActual<typeof import('@/utils/storage')>('@/utils/storage')
  return {
    ...actual,
    getAnalysisStorage: async () => ({
      get: vi.fn(async (_key: string) => null),
    }),
    JsonStorageKeys: {
      scriptCombined: ({ novelId, jobId }: { novelId: string; jobId: string }) => `${novelId}/${jobId}/script_combined.json`,
      fullPages: ({ novelId, jobId }: { novelId: string; jobId: string }) => `${novelId}/${jobId}/full_pages.json`,
    },
    StorageKeys: {
      episodeLayout: ({ novelId, jobId, episodeNumber }: { novelId: string; jobId: string; episodeNumber: number }) => `${novelId}/${jobId}/layouts/episode_${episodeNumber}.json`,
    },
  }
})

// Mock storage ports for episode saveLayout path (write failure scenarios)
vi.mock('@/infrastructure/storage/ports', () => ({
  getStoragePorts: () => ({
    layout: {
      putEpisodeLayout: vi.fn(async () => {
        throw new Error('disk full')
      }),
      putEpisodeLayoutProgress: vi.fn(async () => 'progress.json'),
    },
  }),
}))

// Mock database services for saveLayout
vi.mock('@/services/database', () => ({
  db: {
    layout: () => ({
      upsertLayoutStatus: vi.fn(async () => undefined),
    }),
    jobs: () => ({
      updateJobTotalPages: vi.fn(async () => undefined),
    }),
    episodes: () => ({
      getEpisode: vi.fn(async () => ({ id: 'e1', novelId: 'n1', jobId: 'j1', episodeNumber: 1 })),
      getEpisodesByJobId: vi.fn(async () => []),
      updateEpisodeTextPath: vi.fn(async () => undefined),
    }),
  },
}))

describe('ScriptPort failure scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ExternalIOError when combined script file missing', async () => {
    const port = new FileSystemScriptPort()
    const eff = port.getCombinedScript({ novelId: 'novelX', jobId: 'jobX' })
    const result = await Effect.runPromise(Effect.either(eff))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ExternalIOError')
    }
  })
})

describe('EpisodePort.saveLayout failure scenarios', () => {
  it('fails with ExternalIOError on storage write failure', async () => {
    const episodePort = new DrizzleEpisodePort()
    const eff = episodePort.saveLayout!({
      novelId: 'n1',
      jobId: 'j1',
      episodeNumber: 1,
      layoutJson: { pages: [] },
    })
    const result = await Effect.runPromise(Effect.either(eff))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ExternalIOError')
    }
  })

  it('fails with ExternalIOError on invalid layoutJson shape', async () => {
    const episodePort = new DrizzleEpisodePort()
    const eff = episodePort.saveLayout!({
      novelId: 'n1',
      jobId: 'j1',
      episodeNumber: 1,
      layoutJson: {},
    })
    const result = await Effect.runPromise(Effect.either(eff))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('ExternalIOError')
    }
  })

  it('propagates DatabaseError when DB upsert fails', async () => {
    // Patch existing mocks instead of late doMock (module already loaded)
    const storageModule = await import('@/infrastructure/storage/ports')
    ;(storageModule as unknown as { getStoragePorts: () => unknown }).getStoragePorts = () => ({
      layout: {
        putEpisodeLayout: vi.fn(async () => 'layout.json'),
        putEpisodeLayoutProgress: vi.fn(async () => 'progress.json'),
      },
    })
    const dbModule = await import('@/services/database')
    ;(dbModule.db as unknown as { layout: () => unknown }).layout = () => ({
      upsertLayoutStatus: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    ;(dbModule.db as unknown as { jobs: () => unknown }).jobs = () => ({ updateJobTotalPages: vi.fn(async () => undefined) })
    ;(dbModule.db as unknown as { episodes: () => unknown }).episodes = () => ({
      getEpisode: vi.fn(async () => ({ id: 'e1', novelId: 'n1', jobId: 'j1', episodeNumber: 1 })),
      getEpisodesByJobId: vi.fn(async () => []),
      updateEpisodeTextPath: vi.fn(async () => undefined),
    })

    const episodePort = new DrizzleEpisodePort()
    const eff = episodePort.saveLayout!({
      novelId: 'n1',
      jobId: 'j1',
      episodeNumber: 1,
      layoutJson: { pages: [{ page_number: 1, panels: [] }] },
    })
    const result = await Effect.runPromise(Effect.either(eff))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left._tag).toBe('DatabaseError')
    }
  })
})
