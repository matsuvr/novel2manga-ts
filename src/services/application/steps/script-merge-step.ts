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
      logger.info('Starting script merge process', { jobId, totalChunks })
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
        logger.info('Processing script chunk', { jobId, chunkIndex: i, key })

        const obj = await storage.get(key)
        if (!obj) {
          logger.error('Missing script chunk file', { jobId, chunkIndex: i, key })
          throw new Error(`Missing script chunk ${i}.json for job ${jobId}`)
        }

        // 文字化け検知：日本語文字が含まれているかチェック
        const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(obj.text)
        const textLength = obj.text.length
        logger.info('Script chunk loaded', {
          jobId,
          chunkIndex: i,
          textLength,
          hasJapanese,
          textPreview: obj.text
            .substring(0, ScriptMergeStep.TEXT_PREVIEW_LENGTH)
            .replace(/\n/g, '\\n'),
        })

        let scriptObj: { scenes?: typeof allScenes }
        try {
          scriptObj = JSON.parse(obj.text) as { scenes?: typeof allScenes }
        } catch (parseError) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError)
          logger.error('JSON parse failed for script chunk', {
            jobId,
            chunkIndex: i,
            parseError: parseMsg,
            textPreview: obj.text.substring(0, ScriptMergeStep.ERROR_TEXT_PREVIEW_LENGTH),
          })
          throw new Error(`Failed to parse script chunk ${i}: ${parseMsg}`)
        }

        if (Array.isArray(scriptObj.scenes)) {
          const sceneCount = scriptObj.scenes.length
          const totalLines = scriptObj.scenes.reduce(
            (sum, scene) => sum + (scene.script?.length || 0),
            0,
          )
          logger.info('Script chunk scenes processed', {
            jobId,
            chunkIndex: i,
            sceneCount,
            totalLines,
          })
          allScenes.push(...scriptObj.scenes)
        } else {
          logger.warn('Script chunk has no scenes array', { jobId, chunkIndex: i, scriptObj })
        }
      }

      logger.info('All chunks processed, reindexing lines', {
        jobId,
        totalScenes: allScenes.length,
      })

      // Reindex line indices across scenes
      let nextIndex = 1
      for (const scene of allScenes) {
        for (const line of scene.script || []) {
          line.index = nextIndex++
        }
      }

      const combined = { scenes: allScenes }
      const combinedJson = JSON.stringify(combined, null, 2)

      // 結合結果の検証
      const combinedHasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(combinedJson)
      logger.info('Script merge completed, saving combined result', {
        jobId,
        totalScenes: allScenes.length,
        totalLines: nextIndex - 1,
        combinedJsonLength: combinedJson.length,
        combinedHasJapanese,
      })

      await storage.put(JsonStorageKeys.scriptCombined(jobId), combinedJson, {
        contentType: 'application/json; charset=utf-8',
        jobId,
      })

      logger.info('Script merge successful', { jobId, scenes: allScenes.length })
      return { success: true, data: { merged: true, scenes: allScenes.length } }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      logger.error('Script merge failed', {
        jobId,
        error: msg,
        stack,
        totalChunks,
        step: 'script-merge',
      })
      return { success: false, error: `Script merge failed: ${msg}` }
    }
  }
}
