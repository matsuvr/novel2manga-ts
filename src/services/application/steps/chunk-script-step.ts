import { convertChunkToMangaScript } from '@/agents/script/script-converter'
import { db } from '@/services/database/index'
import type { NewMangaScript } from '@/types/script'
import { getStoredSummary } from '@/utils/chunk-summary'
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
    const { jobId, logger, ports } = context
    const jobDb = db.jobs()
    try {
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

      const maxConcurrent = Math.max(1, Math.min(3, chunks.length))
      const indices = Array.from({ length: chunks.length }, (_, i) => i)

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
          const analysisKey = StorageKeys.chunkAnalysis(jobId, chunkIndex)
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
          const fromStorage = await ports.chunk.getChunk(jobId, index)
          const text = fromStorage?.text ?? ''
          return text
        } catch (e) {
          logger.warn('Failed to load chunk text from storage', {
            jobId,
            chunkIndex: index,
            error: e instanceof Error ? e.message : String(e),
          })
          return undefined
        }
      }

      const worker = async () => {
        while (true) {
          const i = indices.shift()
          if (i === undefined) break
          jobDb.updateJobStep(jobId, `script_chunk_${i}`)
          const text = (await resolveChunkText(i)) ?? ''

          // Read analysis data for this chunk
          const analysisData = await readChunkAnalysis(i)

          const previousSummary = await getStoredSummary(jobId, i - 1)
          const nextSummary = await getStoredSummary(jobId, i + 1)
          logger.info('Converting chunk to manga script', {
            jobId,
            chunkIndex: i,
            textLength: text.length,
            totalChunks: chunks.length,
            hasPreviousSummary: !!previousSummary,
            hasNextSummary: !!nextSummary,
            hasAnalysis: Object.values(analysisData).some((v) => v !== ''),
          })

          if (!text || text.trim().length === 0) {
            const msg = `Chunk text is required and cannot be empty`
            logger.error('Chunk script conversion failed', { jobId, chunkIndex: i, error: msg })
            throw new Error(msg)
          }

          let script: NewMangaScript
          try {
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
          } catch (e) {
            // 生成失敗の診断を analysis に保存
            try {
              const { getProviderForUseCase, getLLMProviderConfig } = await import(
                '@/config/llm.config'
              )
              const { resolveBaseUrl } = await import('@/agents/llm/base-url')
              const provider = getProviderForUseCase('scriptConversion')
              const provCfg = getLLMProviderConfig(provider)
              const baseUrl = resolveBaseUrl(provider, provCfg.baseUrl)

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

              await storage.put(
                `${jobId}/script_chunk_${i}.error.json`,
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
            throw e
          }

          // 早期失敗: script自体がnull/undefinedの場合
          if (!script) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: null/undefined script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i })
            throw new Error(msg)
          }

          // Validate new manga script format（panels必須）
          if (!script.panels || script.panels.length === 0) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: empty manga script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i, script })
            throw new Error(msg)
          }

          // LLM coverage judge: 原文と台本を突き合わせて coverageStats を付与（失敗時は1回だけ自動リトライ）
          const runJudgeOnce = async () => {
            const { getLlmStructuredGenerator } = await import('@/agents/structured-generator')
            const gen = getLlmStructuredGenerator()
            const { CoverageAssessmentSchema } = await import('@/types/script')
            const rawText = text
            const scriptJson = JSON.stringify(script)
            return gen.generateObjectWithFallback<{
              coverageRatio: number
              missingPoints: string[]
              overSummarized: boolean
              notes?: string
            }>({
              name: 'coverage-judge',
              systemPrompt:
                (await import('@/config/app.config')).appConfig?.llm?.coverageJudge?.systemPrompt ??
                'Coverage judge',
              userPrompt:
                (
                  await import('@/config/app.config')
                ).appConfig?.llm?.coverageJudge?.userPromptTemplate
                  ?.replace('{{rawText}}', rawText)
                  ?.replace('{{scriptJson}}', scriptJson) ?? '',
              schema: CoverageAssessmentSchema as unknown as import('zod').ZodTypeAny,
              schemaName: 'CoverageAssessment',
              telemetry: { jobId, chunkIndex: i, stepName: 'coverage-judge' },
            })
          }
          try {
            let result = await runJudgeOnce()
            if (!result || typeof result.coverageRatio !== 'number') {
              logger.warn('Coverage judge returned invalid result, retrying once', {
                jobId,
                chunkIndex: i,
              })
              result = await runJudgeOnce()
            }
            if (result && typeof result === 'object' && typeof result.coverageRatio === 'number') {
              ;(
                script as {
                  coverageStats?: {
                    coverageRatio: number
                    missingPoints: string[]
                    overSummarized: boolean
                  }
                }
              ).coverageStats = {
                coverageRatio: Math.max(0, Math.min(1, result.coverageRatio)),
                missingPoints: Array.isArray(result.missingPoints)
                  ? result.missingPoints.slice(0, 10)
                  : [],
                overSummarized: !!result.overSummarized,
              }
            }
          } catch (e) {
            logger.warn('Coverage judge failed (continuing without coverageStats)', {
              jobId,
              chunkIndex: i,
              error: e instanceof Error ? e.message : String(e),
            })
          }

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
          const key = JsonStorageKeys.scriptChunk(jobId, i)
          await storage.put(key, JSON.stringify(script, null, 2), {
            contentType: 'application/json; charset=utf-8',
            jobId,
            chunk: String(i),
          })
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
