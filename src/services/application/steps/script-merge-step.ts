import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ScriptMergeResult {
  merged: boolean
  scenes: number
}

export class ScriptMergeStep implements PipelineStep {
  readonly stepName = 'script-merge'

  async mergeChunkScripts(
    totalChunks: number,
    context: StepContext,
  ): Promise<StepExecutionResult<ScriptMergeResult>> {
    const { jobId, logger } = context
    try {
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

      const allScenes: Array<{
        id?: string
        setting?: string
        description?: string
        script: Array<{ index?: number; type: string; speaker?: string; text: string }>
      }> = []

      for (let i = 0; i < totalChunks; i++) {
        const key = JsonStorageKeys.scriptChunk(jobId, i)
        const obj = await storage.get(key)
        if (!obj) {
          throw new Error(`Missing script chunk ${i}.json for job ${jobId}`)
        }
        const scriptObj = JSON.parse(obj.text) as { scenes?: typeof allScenes }
        if (Array.isArray(scriptObj.scenes)) {
          allScenes.push(...scriptObj.scenes)
        }
      }

      // Reindex line indices across scenes
      let nextIndex = 1
      for (const scene of allScenes) {
        for (const line of scene.script || []) {
          line.index = nextIndex++
        }
      }

      const combined = { scenes: allScenes }
      await storage.put(JsonStorageKeys.scriptCombined(jobId), JSON.stringify(combined, null, 2), {
        contentType: 'application/json; charset=utf-8',
        jobId,
      })

      return { success: true, data: { merged: true, scenes: allScenes.length } }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Script merge failed', { jobId, error: msg })
      return { success: false, error: msg }
    }
  }
}
