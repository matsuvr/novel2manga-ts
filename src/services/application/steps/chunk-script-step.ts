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
      const { StorageFactory, JsonStorageKeys, StorageKeys } = await import('@/utils/storage')
      const storage = await StorageFactory.getAnalysisStorage()

      const maxConcurrent = Math.max(1, Math.min(3, chunks.length))
      const indices = Array.from({ length: chunks.length }, (_, i) => i)

      // Helper function to read and format analysis data
      const readChunkAnalysis = async (
        chunkIndex: number,
      ): Promise<{
        characterList?: string
        sceneList?: string
        dialogueList?: string
        highlightList?: string
        situationList?: string
      }> => {
        // Type definitions for analysis data
        interface AnalysisCharacter {
          name: string
          description?: string
        }
        interface AnalysisScene {
          location: string
          time?: string
          description?: string
        }
        interface AnalysisDialogue {
          speaker: string
          text?: string
          content?: string
        }
        interface AnalysisHighlight {
          type: string
          importance: number
          description: string
        }
        interface AnalysisSituation {
          description: string
        }
        try {
          const analysisKey = StorageKeys.chunkAnalysis(jobId, chunkIndex)
          const analysisData = await storage.get(analysisKey)

          if (!analysisData) {
            logger.warn('Analysis data not found for chunk, proceeding without it', {
              jobId,
              chunkIndex,
              analysisKey,
            })
            return {}
          }

          const parsed = JSON.parse(analysisData.text)
          const analysis = parsed.analysis || {}

          // Format analysis data for LLM consumption
          const formatCharacters = (chars: unknown[]) =>
            Array.isArray(chars) && chars.length > 0
              ? chars
                  .map((c) => {
                    const char = c as AnalysisCharacter
                    return `${char.name}: ${char.description || 'character'}`
                  })
                  .join(', ')
              : undefined

          const formatScenes = (scenes: unknown[]) =>
            Array.isArray(scenes) && scenes.length > 0
              ? scenes
                  .map((s) => {
                    const scene = s as AnalysisScene
                    return `${scene.location}${scene.time ? ` (${scene.time})` : ''}: ${scene.description || ''}`
                  })
                  .join('; ')
              : undefined

          const formatDialogues = (dialogues: unknown[]) =>
            Array.isArray(dialogues) && dialogues.length > 0
              ? dialogues
                  .map((d) => {
                    const dialogue = d as AnalysisDialogue
                    return `${dialogue.speaker}: "${dialogue.text || dialogue.content}"`
                  })
                  .join('; ')
              : undefined

          const formatHighlights = (highlights: unknown[]) =>
            Array.isArray(highlights) && highlights.length > 0
              ? highlights
                  .map((h) => {
                    const highlight = h as AnalysisHighlight
                    return `${highlight.type} (importance: ${highlight.importance}): ${highlight.description}`
                  })
                  .join('; ')
              : undefined

          const formatSituations = (situations: unknown[]) =>
            Array.isArray(situations) && situations.length > 0
              ? situations
                  .map((s) => {
                    const situation = s as AnalysisSituation
                    return `${situation.description}`
                  })
                  .join('; ')
              : undefined

          return {
            characterList: formatCharacters(analysis.characters),
            sceneList: formatScenes(analysis.scenes),
            dialogueList: formatDialogues(analysis.dialogues),
            highlightList: formatHighlights(analysis.highlights),
            situationList: formatSituations(analysis.situations),
          }
        } catch (error) {
          logger.warn('Failed to read or parse chunk analysis, proceeding without it', {
            jobId,
            chunkIndex,
            error: error instanceof Error ? error.message : String(error),
          })
          return {}
        }
      }

      const worker = async () => {
        while (true) {
          const i = indices.shift()
          if (i === undefined) break
          await jobRepo.updateStep(jobId, `script_chunk_${i}`, i, chunks.length)
          const text = chunks[i]

          // Read analysis data for this chunk
          const analysisData = await readChunkAnalysis(i)

          logger.info('Converting chunk to script with analysis data', {
            jobId,
            chunkIndex: i,
            textLength: text.length,
            hasCharacters: !!analysisData.characterList,
            hasScenes: !!analysisData.sceneList,
            hasDialogues: !!analysisData.dialogueList,
            hasHighlights: !!analysisData.highlightList,
            hasSituations: !!analysisData.situationList,
          })

          const script = await convertEpisodeTextToScript(
            {
              episodeText: text,
              ...analysisData,
            },
            { jobId, episodeNumber: i + 1, useFragmentConversion: false, isDemo: context.isDemo },
          )

          // 早期失敗: script自体がnull/undefinedの場合
          if (!script) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: null/undefined script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i })
            throw new Error(msg)
          }

          // 重複リトライの解消: 以降の追加LLM呼び出しは行わず、script-converter 内のリトライ結果に委ねる
          const scriptWithMeta = script as unknown as {
            needsRetry?: boolean
            coverageStats?: { coverageRatio?: number }
          }
          if (
            scriptWithMeta.needsRetry &&
            scriptWithMeta.coverageStats?.coverageRatio !== undefined
          ) {
            logger.warn(
              'Script conversion reports low coverage; skipping duplicate retries (handled upstream)',
              {
                jobId,
                chunkIndex: i,
                coverage: scriptWithMeta.coverageStats.coverageRatio,
                threshold: 0.8,
              },
            )
          }

          if (scriptWithMeta.coverageStats?.coverageRatio !== undefined) {
            logger.info('Script coverage ratio', {
              jobId,
              chunkIndex: i,
              coverage: scriptWithMeta.coverageStats.coverageRatio,
            })
          }

          // 早期失敗: 空scriptは保存せずに即時エラー
          const scenesLen = Array.isArray((script as { scenes?: unknown[] }).scenes)
            ? ((script as { scenes?: unknown[] }).scenes as unknown[]).length
            : 0
          if (scenesLen <= 0) {
            const preview = text.substring(0, 120).replace(/\n/g, '\\n')
            const msg = `ChunkScriptStep: empty script returned for chunk index=${i}. Aborting. textPreview=${preview}`
            logger.error(msg, { jobId, chunkIndex: i, script })
            throw new Error(msg)
          }

          // 観測性: 非空の場合のみサマリを書き出す（軽量）
          try {
            const summary = {
              jobId,
              chunkIndex: i,
              scenes: scenesLen,
              firstSceneLines:
                scenesLen > 0
                  ? (
                      ((script as unknown as { scenes: Array<{ script?: unknown[] }> }).scenes[0]
                        ?.script || []) as unknown[]
                    ).length
                  : 0,
              textPreview: text.substring(0, 80),
              analysisUsed: {
                hasCharacters: !!analysisData.characterList,
                hasScenes: !!analysisData.sceneList,
                hasDialogues: !!analysisData.dialogueList,
                hasHighlights: !!analysisData.highlightList,
                hasSituations: !!analysisData.situationList,
              },
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
