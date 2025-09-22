import { convertChunkToMangaScript } from '@/agents/script/script-converter'
// import { getAppConfigWithOverrides } from '@/config/app.config' // (coverage機能撤去で未使用)
import { db } from '@/services/database'
import { isFactoryInitialized } from '@/services/database/database-service-factory'
import type { NewMangaScript } from '@/types/script'
import { getStoredSummary } from '@/utils/chunk-summary'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ChunkScriptResult {
  completed: boolean
  chunkCount: number
}

export class ChunkScriptStep implements PipelineStep {
  readonly stepName = 'scriptConversion'

  async convertChunksToScripts(
    chunks: string[],
    context: StepContext,
  ): Promise<StepExecutionResult<ChunkScriptResult>> {
    const { jobId, novelId, logger, ports } = context
    const jobDb = isFactoryInitialized()
      ? db.jobs()
      : ({
          updateJobStep: (_jobId: string, _step: string) => {
            // Mock implementation for tests
          },
          updateJobStatus: (_jobId: string, _status: string, _err?: string) => {
            // Mock implementation for tests
          },
          updateJobProgress: (_jobId: string, _processed: number) => {
            // Mock implementation for tests
          },
        } as unknown as ReturnType<typeof db.jobs>)

    const conversionDb = isFactoryInitialized()
      ? db.chunkConversion()
      : ({
          getStatusesByJob: async () => [] as Array<{
            jobId: string
            chunkIndex: number
            status: string
          }>,
          ensureStatuses: async () => { /* no-op for tests */ },
          markProcessing: async () => { /* no-op for tests */ },
          markCompleted: async (_jobId: string, _chunkIndex: number, _resultPath: string | null) => { /* no-op for tests */ },
          markFailed: async () => { /* no-op for tests */ },
        } as unknown as ReturnType<typeof db.chunkConversion>)
    try {
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

  // coverageJudge 機能は完全撤去（旧: isCoverageCheckEnabled）

      const maxConcurrent = Math.max(1, Math.min(3, chunks.length))
      const indices = Array.from({ length: chunks.length }, (_, i) => i)

      await conversionDb.ensureStatuses(jobId, [...indices])
      const existingStatuses = await conversionDb.getStatusesByJob(jobId)
      const statusMap = new Map<number, { status: string }>(
        existingStatuses.map((status) => [status.chunkIndex, { status: status.status }]),
      )

      let processedCount = existingStatuses.filter((status) => status.status === 'completed').length
      if (typeof jobDb.updateJobProgress === 'function') {
        await jobDb.updateJobProgress(jobId, processedCount)
      }

      // Helper function to read and format analysis data for new prompt format
      const readChunkAnalysis = async (
        chunkIndex: number,
      ): Promise<{
        charactersList?: string
        scenesList?: string
        dialoguesList?: string
        highlightLists?: string
        situations?: string
      }> => {
        try {
          const { StorageKeys } = await import('@/utils/storage')
          const analysisKey = StorageKeys.chunkAnalysis({
            novelId,
            jobId,
            index: chunkIndex,
          })
          const analysisData = await storage.get(analysisKey)

          if (!analysisData) {
            logger.info('Analysis data not found for chunk', {
              jobId,
              chunkIndex,
            })
            return {}
          }

          const parsed = JSON.parse(analysisData.text)
          const analysis = parsed.analysis || {}

          return {
            charactersList: analysis.characters ? JSON.stringify(analysis.characters, null, 2) : '',
            scenesList: analysis.scenes ? JSON.stringify(analysis.scenes, null, 2) : '',
            dialoguesList: analysis.dialogues ? JSON.stringify(analysis.dialogues, null, 2) : '',
            highlightLists: analysis.highlights ? JSON.stringify(analysis.highlights, null, 2) : '',
            situations: analysis.situations ? JSON.stringify(analysis.situations, null, 2) : '',
          }
        } catch (error) {
          logger.warn('Failed to read chunk analysis', {
            jobId,
            chunkIndex,
            error: error instanceof Error ? error.message : String(error),
          })
          return {}
        }
      }

      const resolveChunkText = async (index: number): Promise<string | undefined> => {
        if (index < 0 || index >= chunks.length) return undefined
        const inMemory = chunks[index]
        if (typeof inMemory === 'string' && inMemory.trim().length > 0) return inMemory
        try {
          const stored = await ports.chunk.getChunk(novelId, jobId, index)
          return stored?.text ?? ''
        } catch (e) {
          logger.warn('Failed to load chunk text from storage', {
            jobId,
            chunkIndex: index,
            error: e instanceof Error ? e.message : String(e),
          })
          return undefined
        }
      }

      // 事前に EXPAND の適用有無を検出（analysis/expanded_input.json の存在で判定）
      let expansionMeta: { expanded: boolean; originalLength?: number; expandedLength?: number } = { expanded: false }
      try {
        const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
        const analysisStorage = await StorageFactory.getAnalysisStorage()
        const expKey = JsonStorageKeys.expandedInput({ novelId, jobId })
        const expObj = await analysisStorage.get(expKey)
        if (expObj) {
          try {
            const parsed = JSON.parse(expObj.text) as { originalLength?: number; expandedLength?: number }
            expansionMeta = {
              expanded: true,
              originalLength: parsed.originalLength,
              expandedLength: parsed.expandedLength,
            }
          } catch {
            expansionMeta = { expanded: true }
          }
          logger.info('Detected expansion artifact for job', { jobId, ...expansionMeta })
        }
      } catch (e) {
        logger.warn('Failed to probe expansion artifact (continuing)', {
          jobId,
          error: e instanceof Error ? e.message : String(e),
        })
      }

      const worker = async () => {
        while (true) {
          const i = indices.shift()
          if (i === undefined) break
          const status = statusMap.get(i)
          if (status?.status === 'completed') {
            logger.info('Skipping chunk conversion for already completed chunk', {
              jobId,
              chunkIndex: i,
            })
            continue
          }

          // 二重実行防止：processing状態のチェック
          if (status?.status === 'processing') {
            logger.warn('Chunk appears to be processing. Attempting to reclaim before skipping', {
              jobId,
              chunkIndex: i,
            })
            try {
              // Try to re-claim the chunk for processing. If another worker truly holds it,
              // markProcessing may throw or be a no-op depending on the adapter. If reclaim
              // succeeds, we proceed; otherwise skip.
              await conversionDb.markProcessing(jobId, i)
              logger.info('Reclaimed processing lock for chunk', { jobId, chunkIndex: i })
              statusMap.set(i, { status: 'processing' })
            } catch (claimErr) {
              logger.warn('Failed to reclaim processing lock for chunk, skipping', {
                jobId,
                chunkIndex: i,
                error: claimErr instanceof Error ? claimErr.message : String(claimErr),
              })
              continue
            }
          } else {
            // Normal path: claim processing status
            await conversionDb.markProcessing(jobId, i)
            statusMap.set(i, { status: 'processing' })
          }

          jobDb.updateJobStep(jobId, `script_chunk_${i}`)
          const text = (await resolveChunkText(i)) ?? ''

          // Read analysis data for this chunk
          const analysisData = await readChunkAnalysis(i)

          const previousSummary = await getStoredSummary(novelId, jobId, i - 1)
          const nextSummary = await getStoredSummary(novelId, jobId, i + 1)
          logger.info('Converting chunk to manga script', {
            jobId,
            chunkIndex: i,
            textLength: text.length,
            totalChunks: chunks.length,
            hasPreviousSummary: !!previousSummary,
            hasNextSummary: !!nextSummary,
            hasAnalysis: Object.values(analysisData).some((v) => v !== ''),
            expansionApplied: expansionMeta.expanded,
            expansionOriginalLength: expansionMeta.originalLength,
            expansionExpandedLength: expansionMeta.expandedLength,
          })

          if (!text || text.trim().length === 0) {
            const msg = `Chunk text is required and cannot be empty`
            logger.error('Chunk script conversion failed', { jobId, chunkIndex: i, error: msg })
            throw new Error(msg)
          }

          let script: NewMangaScript
          try {
            logger.info('Starting LLM script conversion', {
              jobId,
              chunkIndex: i,
              textLength: text.length,
              textPreview: text.substring(0, 100).replace(/\n/g, '\\n')
            })

            script = await convertChunkToMangaScript(
              {
                chunkText: text,
                chunkIndex: i + 1,
                chunksNumber: chunks.length,
                previousSummary: previousSummary ?? undefined,
                nextSummary: nextSummary ?? undefined,
                ...analysisData,
              },
              { jobId, isDemo: context.isDemo },
            )

            logger.info('LLM script conversion completed', {
              jobId,
              chunkIndex: i,
              scriptPresent: !!script,
              panelCount: script?.panels?.length || 0,
              characterCount: script?.characters?.length || 0,
              locationCount: script?.locations?.length || 0,
              scriptKeys: script ? Object.keys(script) : []
            })

            // LLMレスポンスの基本構造をチェック
            if (!script) {
              const msg = `LLM returned null/undefined script for chunk ${i}`
              logger.error(msg, { jobId, chunkIndex: i })
              throw new Error(msg)
            }

            if (typeof script !== 'object') {
              const msg = `LLM returned non-object script for chunk ${i}: ${typeof script}`
              logger.error(msg, { jobId, chunkIndex: i, script })
              throw new Error(msg)
            }
          } catch (e) {
            // 生成失敗の診断を analysis に保存
            try {
              const { getProviderForUseCase, getLLMProviderConfig } = await import('@/config/llm.config')
              const { resolveBaseUrl } = await import('@/agents/llm/base-url')
              // scriptConversion 用の個別 use-case は撤去 -> chunkConversion を利用
              const provider = getProviderForUseCase('chunkConversion')
              const provCfg = getLLMProviderConfig(provider)
              const providerNormalized: 'vertexai' | 'openai' | 'groq' | 'grok' | 'openrouter' | 'fake' =
                provider === 'vertexai_lite' || provider === 'gemini'
                  ? 'vertexai'
                  : (provider as 'openai' | 'groq' | 'grok' | 'openrouter' | 'vertexai' | 'fake')
              const baseUrl = resolveBaseUrl(providerNormalized, provCfg.baseUrl)

              const errorInfo = {
                jobId,
                chunkIndex: i,
                timestamp: new Date().toISOString(),
                provider,
                model: provCfg.model,
                baseUrl,
                error: {
                  message: e instanceof Error ? e.message : String(e),
                },
                promptMeta: {
                  chunkTextPreview: text.substring(0, 120),
                  hasPreviousSummary: !!previousSummary,
                  hasNextSummary: !!nextSummary,
                  hasAnalysis: Object.values(analysisData).some((v) => v !== ''),
                },
              } as const

              const scriptKey = JsonStorageKeys.scriptChunk({ novelId, jobId, index: i })
              const errorKey = scriptKey.endsWith('.json')
                ? scriptKey.replace(/\.json$/, '.error.json')
                : `${scriptKey}.error.json`
              await storage.put(
                errorKey,
                JSON.stringify(errorInfo, null, 2),
                { contentType: 'application/json; charset=utf-8', jobId, chunk: String(i) },
              )
            } catch (persistError) {
              logger.warn('Failed to store script_chunk error diagnostic', {
                jobId,
                chunkIndex: i,
                error: persistError instanceof Error ? persistError.message : String(persistError),
              })
            }
            // エラーを再送出してパイプラインを停止
            await conversionDb.markFailed(
              jobId,
              i,
              e instanceof Error ? e.message : String(e),
            )
            throw e
          }

          // 早期失敗: script自体がnull/undefinedの場合
          if (!script) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: null/undefined script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i })
            await conversionDb.markFailed(jobId, i, msg)
            throw new Error(msg)
          }

          // Validate new manga script format（panels必須）
          if (!script.panels || script.panels.length === 0) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: empty manga script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i, script })
            await conversionDb.markFailed(jobId, i, msg)
            throw new Error(msg)
          }

          // coverage judge 削除: ここでの coverageStats 付与ロジックも削除済み

          logger.info('Manga script generated successfully', {
            jobId,
            chunkIndex: i,
            panelsCount: script.panels.length,
            charactersCount: script.characters.length,
            locationsCount: script.locations.length,
          })

          // Store summary of manga script
          try {
            const summary = {
              jobId,
              chunkIndex: i,
              panels: script.panels.length,
              charactersCount: script.characters.length,
              locationsCount: script.locations.length,
              propsCount: script.props.length,
              style: {
                tone: script.style_tone,
                art: script.style_art,
                sfx: script.style_sfx,
              },
              textPreview: text.substring(0, 80),
              createdAt: new Date().toISOString(),
            }
            await storage.put(
              `${jobId}/script_chunk_${i}.summary.json`,
              JSON.stringify(summary, null, 2),
              { contentType: 'application/json; charset=utf-8', jobId, chunk: String(i) },
            )
          } catch (e) {
            logger.warn('Failed to store script_chunk summary (continuing)', {
              jobId,
              chunkIndex: i,
              error: e instanceof Error ? e.message : String(e),
            })
          }
          const key = JsonStorageKeys.scriptChunk({ novelId, jobId, index: i })
          const scriptJson = JSON.stringify(script, null, 2)

          // 追加のバリデーション：保存前に再度チェック
          if (!script.panels || script.panels.length === 0) {
            const msg = `Pre-save validation failed: script chunk ${i} has no panels`
            logger.error(msg, { jobId, chunkIndex: i, script })
            await conversionDb.markFailed(jobId, i, msg)
            throw new Error(msg)
          }

          logger.info('Saving script chunk to storage', {
            jobId,
            chunkIndex: i,
            key,
            panelCount: script.panels.length,
            jsonLength: scriptJson.length
          })

          await storage.put(key, scriptJson, {
            contentType: 'application/json; charset=utf-8',
            jobId,
            chunk: String(i),
          })

          // 保存後にファイルが実際に存在することを確認
          const savedFile = await storage.get(key)
          if (!savedFile) {
            const msg = `Post-save verification failed: script chunk ${i} was not saved properly`
            logger.error(msg, { jobId, chunkIndex: i, key })
            await conversionDb.markFailed(jobId, i, msg)
            throw new Error(msg)
          }

          // 保存されたファイルをパースして検証
          try {
            const savedScript = JSON.parse(savedFile.text) as NewMangaScript
            if (!savedScript.panels || savedScript.panels.length === 0) {
              const msg = `Post-save content verification failed: script chunk ${i} has no panels in saved file`
              logger.error(msg, { jobId, chunkIndex: i, savedScript })
              await conversionDb.markFailed(jobId, i, msg)
              throw new Error(msg)
            }
            logger.info('Script chunk saved and verified successfully', {
              jobId,
              chunkIndex: i,
              savedPanelCount: savedScript.panels.length
            })
          } catch (parseErr) {
            const msg = `Post-save parse verification failed: script chunk ${i} saved file is not valid JSON`
            logger.error(msg, { jobId, chunkIndex: i, error: parseErr instanceof Error ? parseErr.message : String(parseErr) })
            await conversionDb.markFailed(jobId, i, msg)
            throw new Error(msg)
          }
          await conversionDb.markCompleted(jobId, i, key)
          processedCount += 1
          statusMap.set(i, { status: 'completed' })
          if (typeof jobDb.updateJobProgress === 'function') {
            await jobDb.updateJobProgress(jobId, processedCount)
          }
          jobDb.updateJobStep(jobId, `script_chunk_${i}_done`)
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
