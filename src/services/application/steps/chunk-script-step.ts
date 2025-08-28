import { convertEpisodeTextToScript } from '@/agents/script/script-converter'
import { getJobRepository } from '@/repositories'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ChunkScriptResult {
  completed: boolean
  chunkCount: number
}

export class ChunkScriptStep implements PipelineStep {
  readonly stepName = 'chunk-script'

  async convertChunksToScripts(
    chunks: string[],
    context: StepContext,
  ): Promise<StepExecutionResult<ChunkScriptResult>> {
    const { jobId, logger } = context
    const jobRepo = getJobRepository()
    try {
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

      const maxConcurrent = Math.max(1, Math.min(3, chunks.length))
      const indices = Array.from({ length: chunks.length }, (_, i) => i)

      const worker = async () => {
        while (true) {
          const i = indices.shift()
          if (i === undefined) break
          await jobRepo.updateStep(jobId, `script_chunk_${i}`, i, chunks.length)
          const text = chunks[i]
          const script = await convertEpisodeTextToScript(
            { episodeText: text },
            { jobId, episodeNumber: i + 1, useFragmentConversion: false },
          )
          const key = JsonStorageKeys.scriptChunk(jobId, i)
          await storage.put(key, JSON.stringify(script, null, 2), {
            contentType: 'application/json; charset=utf-8',
            jobId,
            chunk: String(i),
          })
          await jobRepo.updateStep(jobId, `script_chunk_${i}_done`, i + 1, chunks.length)
        }
      }

      await Promise.all(Array.from({ length: maxConcurrent }, () => worker()))
      return { success: true, data: { completed: true, chunkCount: chunks.length } }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Chunk script conversion failed', { jobId, error: msg })
      return { success: false, error: msg }
    }
  }
}
