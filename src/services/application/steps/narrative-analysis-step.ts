import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import { getChunkRepository, getJobRepository } from '@/repositories'
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
      // すべてのチャンクを走査して境界を順次推定（単発ではなく全体をカバー）
      const chunkRepo = getChunkRepository()
      const chunkMetas = await chunkRepo.getByJobId(jobId)
      const totalChunks = chunkMetas.length
      const boundariesAll: EpisodeBoundary[] = []
      let boundaries: EpisodeBoundary[] = []

      const chunkRepository = new StorageChunkRepository()

      try {
        logger.info('Starting narrative arc analysis (multi-pass)', { jobId, totalChunks })

        let startIndex = 0
        let nextEpisodeNumberOffset = 0

        // 安全ブレーク: 最大ループ回数（全チャンク+5）
        const maxPasses = Math.max(1, totalChunks) + 5
        let pass = 0

        while (startIndex < totalChunks && pass < maxPasses) {
          pass++
          // 入力準備（このパスの開始チャンクから目標文字数まで）
          const input = await prepareNarrativeAnalysisInput({
            jobId,
            startChunkIndex: startIndex,
          })
          if (!input || !input.chunks || input.chunks.length === 0) {
            logger.warn('No narrative input produced for pass', { jobId, startIndex, pass })
            break
          }

          // 連番が重複しないように episodeNumber の開始番号をオフセット
          const startingEpisodeNumber = nextEpisodeNumberOffset + 1

          const batchBoundaries =
            (await analyzeNarrativeArc({ ...input, startingEpisodeNumber }, chunkRepository)) ?? []

          // 追加
          boundariesAll.push(...batchBoundaries)

          // 次のパスの開始位置を進める
          // 通常はこのパスで扱ったチャンク数分だけ進める（重複を避けるため +1 で前進）
          startIndex += input.chunks.length
          // エピソード番号オフセットを更新
          if (batchBoundaries.length > 0) {
            nextEpisodeNumberOffset =
              startingEpisodeNumber - 1 + Math.max(...batchBoundaries.map((b) => b.episodeNumber))
          }

          logger.info('Narrative arc pass completed', {
            jobId,
            pass,
            startIndex,
            batchBoundaries: batchBoundaries.length,
            totalAccumulated: boundariesAll.length,
          })
        }

        logger.info('Narrative arc analysis completed (multi-pass)', {
          jobId,
          boundariesFound: boundariesAll.length,
        })

        boundaries = boundariesAll
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
