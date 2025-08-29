import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ScriptMergeResult {
  merged: boolean
  panels: number
}

export class ScriptMergeStep implements PipelineStep {
  readonly stepName = 'script-merge'

  static readonly TEXT_PREVIEW_LENGTH = 100
  static readonly ERROR_TEXT_PREVIEW_LENGTH = 200

  async mergeChunkScripts(
    totalChunks: number,
    context: StepContext,
  ): Promise<StepExecutionResult<ScriptMergeResult>> {
    const { jobId, logger } = context
    try {
      logger.info('Starting script merge process', { jobId, totalChunks })
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

      const allPanels: Array<{
        no: number
        cut: string
        camera: string
        narration?: string[]
        dialogue?: string[]
        sfx?: string[]
      }> = []

      const LOW_COVERAGE_WARN = 0.8
      const MIN_COVERAGE_FAIL = 0.6
      const lowCoverageChunks: Array<{ index: number; ratio: number }> = []
      const failCoverageChunks: Array<{ index: number; ratio: number }> = []

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

        let scriptObj: { panels?: typeof allPanels; coverageStats?: { coverageRatio?: number } }
        try {
          scriptObj = JSON.parse(obj.text) as {
            panels?: typeof allPanels
            coverageStats?: { coverageRatio?: number }
          }
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

        // Coverage gate (warn/fail)
        const ratio = Number(scriptObj.coverageStats?.coverageRatio ?? NaN)
        if (Number.isFinite(ratio)) {
          if (ratio < MIN_COVERAGE_FAIL) failCoverageChunks.push({ index: i, ratio })
          else if (ratio < LOW_COVERAGE_WARN) lowCoverageChunks.push({ index: i, ratio })
        } else {
          // coverage情報が無い場合は警告のみ（マージは継続）
          lowCoverageChunks.push({ index: i, ratio: 0 })
        }

        if (Array.isArray(scriptObj.panels)) {
          const panelCount = scriptObj.panels.length
          logger.info('Script chunk panels processed', {
            jobId,
            chunkIndex: i,
            panelCount,
          })
          allPanels.push(...scriptObj.panels)
        } else {
          logger.warn('Script chunk has no panels array', { jobId, chunkIndex: i, scriptObj })
        }
      }

      // Fail fast if any chunk is below minimum acceptable coverage
      if (failCoverageChunks.length > 0) {
        const details = failCoverageChunks
          .map((c) => `chunk=${c.index} ratio=${c.ratio.toFixed(3)}`)
          .join(', ')

        // SAFE preview (env-controlled) for troubleshooting
        if (process.env.LOG_SAFE_PREVIEW === '1') {
          try {
            const { StorageFactory, StorageKeys } = await import('@/utils/storage')
            const chunkStorage = await StorageFactory.getChunkStorage()
            const previewItems: Array<{ chunkIndex: number; preview: string }> = []
            for (const c of failCoverageChunks.slice(0, 3)) {
              const key = StorageKeys.chunk(jobId, c.index)
              const obj = await chunkStorage.get(key)
              const raw = obj?.text ?? ''
              const preview = (raw.slice(0, 200) || '').replace(/\n/g, '\\n')
              previewItems.push({ chunkIndex: c.index, preview })
            }
            logger.error('Low coverage SAFE previews', { jobId, previews: previewItems })
          } catch (e) {
            logger.warn('Failed to produce SAFE preview for low coverage chunks', {
              jobId,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        }

        logger.error('Script merge aborted due to low coverage in chunks', {
          jobId,
          minCoverage: MIN_COVERAGE_FAIL,
          details,
        })
        throw new Error(
          `Coverage too low in ${failCoverageChunks.length} chunk(s) (min=${MIN_COVERAGE_FAIL}). Details: ${details}`,
        )
      }

      if (lowCoverageChunks.length > 0) {
        logger.warn('Some chunks have low coverage (proceeding)', {
          jobId,
          warnThreshold: LOW_COVERAGE_WARN,
          chunks: lowCoverageChunks.map((c) => ({ index: c.index, ratio: c.ratio })),
        })
      }

      logger.info('All chunks processed, combining panels', {
        jobId,
        totalPanels: allPanels.length,
      })

      // 早期失敗: 0シーンなら結合結果を保存せずに明示エラー
      if (allPanels.length === 0) {
        logger.error('Script merge aborted: no panels collected from any chunk', {
          jobId,
          totalChunks,
        })
        throw new Error('Script merge failed: collected 0 panels from all chunks')
      }

      const combined = { panels: allPanels }
      const combinedJson = JSON.stringify(combined, null, 2)

      // 結合結果の検証
      const combinedHasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(combinedJson)
      logger.info('Script merge completed, saving combined result', {
        jobId,
        totalPanels: allPanels.length,
        combinedJsonLength: combinedJson.length,
        combinedHasJapanese,
      })

      await storage.put(JsonStorageKeys.scriptCombined(jobId), combinedJson, {
        contentType: 'application/json; charset=utf-8',
        jobId,
      })

      logger.info('Script merge successful', { jobId, panels: allPanels.length })
      return { success: true, data: { merged: true, panels: allPanels.length } }
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
