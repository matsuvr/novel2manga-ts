import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

  it('fails fast when any chunk coverage is below 0.6', async () => {
    const { ScriptMergeStep } = await import('@/services/application/steps/script-merge-step')
    const step = new ScriptMergeStep()
    const res = await step.mergeChunkScripts(2, {
      jobId: 'job1',
      logger: console as any,
      ports: {} as any,
      isDemo: true,
      novelId: 'nov1',
    })
    expect(res.success).toBe(false)
    expect(String(res.error || '')).toContain('Coverage too low')
  })
})
