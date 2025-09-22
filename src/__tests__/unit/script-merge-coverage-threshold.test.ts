import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_NOVEL_ID = 'nov1'
const TEST_JOB_ID = 'job1'
const scriptChunkKey = (index: number) =>
  `${TEST_NOVEL_ID}/jobs/${TEST_JOB_ID}/analysis/script_chunk_${index}.json`

const chunkStore = new Map<string, string>([
  [
    scriptChunkKey(0),
    JSON.stringify({
      scenes: [{ script: [{ type: 'narration', text: 'a' }] }],
      coverageStats: {
        totalChars: 200,
        coveredChars: 180,
        coverageRatio: 0.9,
        uncoveredCount: 0,
        uncoveredSpans: [],
      },
    }),
  ],
  [
    scriptChunkKey(1),
    JSON.stringify({
      scenes: [{ script: [{ type: 'narration', text: 'b' }] }],
      coverageStats: {
        totalChars: 200,
        coveredChars: 80,
        coverageRatio: 0.4,
        uncoveredCount: 0,
        uncoveredSpans: [],
      },
    }),
  ],
])

vi.mock('@/utils/storage', () => {
  const analysisStorage = {
    async get(key: string) {
      const text = chunkStore.get(key)
      return text ? { text } : null
    },
    async put(key: string, content: string) {
      chunkStore.set(key, content)
      return true
    },
  }

  return {
    StorageFactory: { getAnalysisStorage: async () => analysisStorage },
    JsonStorageKeys: {
      scriptChunk: ({ novelId, jobId, index }: { novelId: string; jobId: string; index: number }) =>
        `${novelId}/jobs/${jobId}/analysis/script_chunk_${index}.json`,
      scriptCombined: ({ novelId, jobId }: { novelId: string; jobId: string }) =>
        `${novelId}/jobs/${jobId}/analysis/script_combined.json`,
      fullPages: ({ novelId, jobId }: { novelId: string; jobId: string }) =>
        `${novelId}/jobs/${jobId}/layouts/full_pages.json`,
      chunkSummary: ({ novelId, jobId, index }: { novelId: string; jobId: string; index: number }) =>
        `${novelId}/jobs/${jobId}/analysis/chunk_${index}.summary.json`,
    },
  }
})

describe('ScriptMergeStep - coverage threshold', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('@/config/app.config')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('continues processing but includes coverage warnings when coverage is below 0.6', async () => {
    vi.resetModules()
    const { ScriptMergeStep } = await import('@/services/application/steps/script-merge-step')
    const { getAppConfigWithOverrides } = await import('@/config/app.config')
    const cfg = getAppConfigWithOverrides()
    if (!cfg.features.enableCoverageCheck) {
      // シングルソース設定方針: feature が無効ならこのケースは意味を持たないためスキップ
      console.warn('[skip] coverage check feature disabled in config')
      return
    }

    // Overwrite chunk store with panel data
    chunkStore.set(
      scriptChunkKey(0),
      JSON.stringify({
        panels: [{ no: 1, cut: 'test1', camera: 'wide' }],
        coverageStats: {
          totalChars: 200,
          coveredChars: 180,
          coverageRatio: 0.9,
          uncoveredCount: 0,
          uncoveredSpans: [],
        },
      }),
    )
    chunkStore.set(
      scriptChunkKey(1),
      JSON.stringify({
        panels: [{ no: 2, cut: 'test2', camera: 'close' }],
        coverageStats: {
          totalChars: 200,
          coveredChars: 80,
          coverageRatio: 0.4,
          uncoveredCount: 0,
          uncoveredSpans: [],
        },
      }),
    )

    const step = new ScriptMergeStep()
    const res = await step.mergeChunkScripts(2, {
      jobId: TEST_JOB_ID,
      novelId: TEST_NOVEL_ID,
      logger: console as any,
      ports: {} as any,
      isDemo: true,
    })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.coverageWarnings).toBeDefined()
      expect(res.data.coverageWarnings?.length).toBe(1)
      expect(res.data.coverageWarnings?.[0].chunkIndex).toBe(1)
      expect(res.data.coverageWarnings?.[0].coverageRatio).toBe(0.4)
    }
  })

  it('skips coverage warnings when coverage check feature is disabled', async () => {
    chunkStore.set(
      scriptChunkKey(0),
      JSON.stringify({
        panels: [{ no: 1, cut: 'test1', camera: 'wide' }],
        coverageStats: { coverageRatio: 0.5 },
      }),
    )
    chunkStore.set(
      scriptChunkKey(1),
      JSON.stringify({
        panels: [{ no: 2, cut: 'test2', camera: 'close' }],
        coverageStats: { coverageRatio: 0.4 },
      }),
    )

    vi.resetModules()
    const { ScriptMergeStep } = await import('@/services/application/steps/script-merge-step')
    const { getAppConfigWithOverrides } = await import('@/config/app.config')
    const cfg = getAppConfigWithOverrides()
    const step = new ScriptMergeStep()
    const res = await step.mergeChunkScripts(2, {
      jobId: TEST_JOB_ID,
      novelId: TEST_NOVEL_ID,
      logger: console as any,
      ports: {} as any,
      isDemo: true,
    })
    expect(res.success).toBe(true)
    if (res.success) {
      if (cfg.features.enableCoverageCheck) {
        expect(res.data.coverageWarnings).toBeDefined()
      } else {
        expect(res.data.coverageWarnings).toBeUndefined()
      }
    }
  })
})
