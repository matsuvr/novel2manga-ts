import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { setupUnifiedTestEnvironment, UnifiedStorageFactory } from '../__helpers/unified-test-setup'

describe('ChunkScriptStep and ScriptMergeStep guards', () => {
  let cleanup: () => void

  beforeEach(() => {
    const env = setupUnifiedTestEnvironment()
    cleanup = env.cleanup
  })

  afterEach(() => {
    cleanup()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('ChunkScriptStep: throws and does not save when script.scenes is empty', async () => {
    // Arrange: mock converter to return empty scenes
    vi.doMock('@/agents/script/script-converter', () => ({
      convertEpisodeTextToScript: vi.fn().mockResolvedValue({ title: 't', scenes: [] }),
    }))

    const { ChunkScriptStep } = await import('@/services/application/steps/chunk-script-step')
    const analysisStorage = await (
      await import('@/utils/storage')
    ).StorageFactory.getAnalysisStorage()
    const { JsonStorageKeys } = await import('@/utils/storage')

    const jobId = 'job-earlyfail'
    const text = 'これは十分な長さのテキストで台本化の入力になります。'.repeat(2)
    const context = {
      jobId,
      novelId: 'novel-1',
      logger: getLogger().withContext({ test: 'chunk-guard' }),
      ports: getStoragePorts(),
    }

    // Act
    const step = new ChunkScriptStep()
    const res = await step.convertChunksToScripts([text], context)

    // Assert: failure and no script_chunk saved
    expect(res.success).toBe(false)
    const key = JsonStorageKeys.scriptChunk({ novelId: context.novelId, jobId, index: 0 })
    expect(await analysisStorage.exists(key)).toBe(false)
  })

  it('ScriptMergeStep: aborts and does not write combined when all chunks are empty', async () => {
    const { ScriptMergeStep } = await import('@/services/application/steps/script-merge-step')
    const { JsonStorageKeys, StorageFactory } = await import('@/utils/storage')

    const jobId = 'job-merge-empty'
    const novelId = 'novel-1'
    const analysis = await StorageFactory.getAnalysisStorage()
    const context = {
      jobId,
      novelId,
      logger: getLogger().withContext({ test: 'merge-guard' }),
      ports: getStoragePorts(),
    }
    // Prepare two empty chunk scripts
    await analysis.put(
      JsonStorageKeys.scriptChunk({ novelId, jobId, index: 0 }),
      JSON.stringify({ scenes: [] }),
      {
        contentType: 'application/json; charset=utf-8',
        jobId,
        chunk: '0',
      },
    )
    await analysis.put(
      JsonStorageKeys.scriptChunk({ novelId, jobId, index: 1 }),
      JSON.stringify({ scenes: [] }),
      {
        contentType: 'application/json; charset=utf-8',
        jobId,
        chunk: '1',
      },
    )

    const step = new ScriptMergeStep()
    const res = await step.mergeChunkScripts(2, context)

    expect(res.success).toBe(false)
    const combinedKey = JsonStorageKeys.scriptCombined({ novelId, jobId })
    expect(await analysis.exists(combinedKey)).toBe(false)
  })
})
