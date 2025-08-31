import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock storage to feed script chunks with coverage ratios
vi.mock('@/utils/storage', async () => {
  const chunks: Record<string, string> = {
    'job1/script_chunk_0.json': JSON.stringify({
      scenes: [{ script: [{ type: 'narration', text: 'a' }] }],
      coverageStats: {
        totalChars: 200,
        coveredChars: 180,
        coverageRatio: 0.9,
        uncoveredCount: 0,
        uncoveredSpans: [],
      },
    }),
    'job1/script_chunk_1.json': JSON.stringify({
      scenes: [{ script: [{ type: 'narration', text: 'b' }] }],
      coverageStats: {
        totalChars: 200,
        coveredChars: 80,
        coverageRatio: 0.4,
        uncoveredCount: 0,
        uncoveredSpans: [],
      },
    }),
  }
  const analysisStorage = {
    async get(key: string) {
      const text = chunks[key]
      return text ? { text } : null
    },
  }
  return {
    StorageFactory: { getAnalysisStorage: async () => analysisStorage },
    JsonStorageKeys: {
      scriptChunk: (jobId: string, index: number) => `${jobId}/script_chunk_${index}.json`,
      scriptCombined: (jobId: string) => `${jobId}/script_combined.json`,
      fullPages: (jobId: string) => `${jobId}/full_pages.json`,
    },
  }
})

describe('ScriptMergeStep - coverage threshold', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv }
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('continues processing but includes coverage warnings when coverage is below 0.6', async () => {
    const { ScriptMergeStep } = await import('@/services/application/steps/script-merge-step')

    // Mock panels for both chunks
    const mockChunks = {
      'job1/script_chunk_0.json': JSON.stringify({
        panels: [{ no: 1, cut: 'test1', camera: 'wide' }],
        coverageStats: {
          totalChars: 200,
          coveredChars: 180,
          coverageRatio: 0.9,
          uncoveredCount: 0,
          uncoveredSpans: [],
        },
      }),
      'job1/script_chunk_1.json': JSON.stringify({
        panels: [{ no: 2, cut: 'test2', camera: 'close' }],
        coverageStats: {
          totalChars: 200,
          coveredChars: 80,
          coverageRatio: 0.4, // Below 0.6 threshold
          uncoveredCount: 0,
          uncoveredSpans: [],
        },
      }),
    }

    // Update the mock to return the new chunks with panels
    const originalMock = await import('@/utils/storage')
    vi.doMock('@/utils/storage', async () => {
      const analysisStorage = {
        async get(key: string) {
          const text = mockChunks[key as keyof typeof mockChunks]
          return text ? { text } : null
        },
        async put(key: string, content: string) {
          // Mock put method for combined script
          return true
        },
      }
      return {
        StorageFactory: { getAnalysisStorage: async () => analysisStorage },
        JsonStorageKeys: {
          scriptChunk: (jobId: string, index: number) => `${jobId}/script_chunk_${index}.json`,
          scriptCombined: (jobId: string) => `${jobId}/script_combined.json`,
          fullPages: (jobId: string) => `${jobId}/full_pages.json`,
        },
      }
    })

    const step = new ScriptMergeStep()
    const res = await step.mergeChunkScripts(2, {
      jobId: 'job1',
      logger: console as any,
      ports: {} as any,
      isDemo: true,
      novelId: 'nov1',
    })

    // Should succeed but with warnings
    expect(res.success).toBe(true)
    expect(res.data.coverageWarnings).toBeDefined()
    expect(res.data.coverageWarnings?.length).toBe(1) // Only chunk 1 has low coverage
    expect(res.data.coverageWarnings?.[0].chunkIndex).toBe(1)
    expect(res.data.coverageWarnings?.[0].coverageRatio).toBe(0.4)
    expect(res.data.coverageWarnings?.[0].message).toContain('カバレッジが低くなっています')
  })
})
