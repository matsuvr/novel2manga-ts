import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import { getJobRepository } from '@/repositories'
import type { EpisodeBoundary } from '@/types/episode'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { saveEpisodeBoundaries } from '@/utils/storage'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface NarrativeAnalysisResult {
  boundaries: EpisodeBoundary[]
  hasBoundaries: boolean
}

/**
 * Step responsible for narrative arc analysis and episode boundary detection
 */
export class NarrativeAnalysisStep implements PipelineStep {
  readonly stepName = 'narrative-analysis'

  /**
   * Analyze narrative arc and detect episode boundaries
   */
  async analyzeNarrativeArc(
    context: StepContext,
  ): Promise<StepExecutionResult<NarrativeAnalysisResult>> {
    const { jobId, logger } = context

    try {
      // ここで「エピソード分析の入力を準備（必要なストレージ/DBから読み出して集約する処理）」
      const input = await prepareNarrativeAnalysisInput({
        jobId,
        startChunkIndex: 0,
      })
      if (!input) {
        return { success: false, error: 'Failed to prepare narrative analysis input' }
      }

      const chunkRepository = new StorageChunkRepository()
      let boundaries: EpisodeBoundary[]

      try {
        // ここで「LLM を呼び出して物語構造（ナラティブアーク）を分析し、エピソード境界を推定」
        //   - input（集約済みテキスト等）を LLM に渡す
        logger.info('Starting narrative arc analysis', { jobId })
        boundaries = (await analyzeNarrativeArc(input, chunkRepository)) ?? []
        logger.info('Narrative arc analysis completed', {
          jobId,
          boundariesFound: boundaries.length,
          boundaries: boundaries.map((b) => ({
            episodeNumber: b.episodeNumber,
            title: b.title,
            startChunk: b.startChunk,
            startCharIndex: b.startCharIndex,
            endChunk: b.endChunk,
            endCharIndex: b.endCharIndex,
          })),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Narrative arc analysis failed', {
          jobId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        })

        // コンソールにも構造化ログを出力
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            service: 'analyze-pipeline',
            operation: 'narrative-arc-analysis',
            msg: 'Narrative arc analysis failed',
            jobId,
            error: errorMessage,
            stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
          }),
        )

        // ジョブステータスを失敗に更新
        try {
          const jobRepo = getJobRepository()
          // ここで「DBのジョブステータスを failed に更新（書き込み）」
          await jobRepo.updateStatus(jobId, 'failed', errorMessage)
        } catch (statusError) {
          logger.error('Failed to update job status after narrative analysis failure', {
            jobId,
            originalError: errorMessage,
            statusError: statusError instanceof Error ? statusError.message : String(statusError),
          })
        }

        return { success: false, error: errorMessage }
      }

      if (Array.isArray(boundaries) && boundaries.length > 0) {
        logger.info('Episode boundaries detected, starting episode processing', {
          jobId,
          boundariesCount: boundaries.length,
          episodeNumbers: boundaries.map((b) => b.episodeNumber),
        })

        // ここで「検出したエピソード境界をストレージ/DBへ保存（ユーティリティで一括）」（書き込み）
        try {
          await saveEpisodeBoundaries(jobId, boundaries)
          logger.info('Episode boundaries saved successfully', { jobId })
        } catch (saveError) {
          const errorMessage = saveError instanceof Error ? saveError.message : String(saveError)
          logger.error('Failed to save episode boundaries - critical error', {
            jobId,
            error: errorMessage,
            stack: saveError instanceof Error ? saveError.stack : undefined,
            boundariesCount: boundaries.length,
            boundaries: boundaries.map((b) => ({ episodeNumber: b.episodeNumber, title: b.title })),
          })

          // コンソールにも構造化ログを出力
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              level: 'error',
              service: 'analyze-pipeline',
              operation: 'save-episode-boundaries',
              msg: 'Failed to save episode boundaries - critical for story processing',
              jobId,
              error: errorMessage,
              stack: saveError instanceof Error ? saveError.stack?.slice(0, 1000) : undefined,
            }),
          )

          // エピソード境界の保存は物語処理に必須のため、失敗時は処理停止
          try {
            const jobRepo = getJobRepository()
            await jobRepo.updateStatus(
              jobId,
              'failed',
              `Failed to save episode boundaries: ${errorMessage}`,
            )
          } catch (statusError) {
            logger.error('Failed to update job status after boundary save failure', {
              jobId,
              originalError: errorMessage,
              statusError: statusError instanceof Error ? statusError.message : String(statusError),
            })
          }

          return {
            success: false,
            error: `Failed to save episode boundaries: ${errorMessage}. Story processing cannot continue without proper episode boundaries.`,
          }
        }

        return {
          success: true,
          data: {
            boundaries,
            hasBoundaries: true,
          },
        }
      } else {
        logger.warn('No episode boundaries detected, but proceeding with basic completion', {
          jobId,
          boundariesLength: boundaries?.length || 0,
          boundariesType: typeof boundaries,
        })

        return {
          success: true,
          data: {
            boundaries: [],
            hasBoundaries: false,
          },
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Narrative analysis step failed', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
