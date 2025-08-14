import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { getEpisodeConfig } from '@/config'
import type { NewEpisode } from '@/db'
import type { AnalyzedChunk, IChunkRepository } from '@/domain/repositories/chunk-repository'
import type { RetryableError } from '@/errors/retryable-error'
import { isRetryableError } from '@/errors/retryable-error'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { EpisodeWriteService } from '@/services/application/episode-write'
import type { JobProgressService } from '@/services/application/job-progress'
import type { EpisodeBoundary } from '@/types/episode'
import type { JobProgress } from '@/types/job'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'

// RetryableError is provided by errors/retryable-error

export interface NarrativeProcessorConfig {
  chunksPerBatch: number
  overlapChars: number
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  maxRetries: number
  retryDelay: number
}

export class JobNarrativeProcessor {
  private config: NarrativeProcessorConfig

  constructor(
    private jobService: JobProgressService,
    private episodeService: EpisodeWriteService,
    config?: Partial<NarrativeProcessorConfig>,
    private logger: LoggerPort = getLogger().withContext({
      service: 'JobNarrativeProcessor',
    }),
  ) {
    const episodeConfig = getEpisodeConfig()
    this.config = {
      chunksPerBatch: 20,
      overlapChars: 500,
      targetCharsPerEpisode: config?.targetCharsPerEpisode || episodeConfig.targetCharsPerEpisode,
      minCharsPerEpisode: config?.minCharsPerEpisode || episodeConfig.minCharsPerEpisode,
      maxCharsPerEpisode: config?.maxCharsPerEpisode || episodeConfig.maxCharsPerEpisode,
      maxRetries: 3,
      retryDelay: 5000,
      ...config,
    }
  }

  /**
   * ジョブの処理を開始または再開
   */
  async processJob(
    jobId: string,
    onProgress?: (progress: JobProgress) => void,
  ): Promise<JobProgress> {
    this.logger.info('Starting episode analysis', { jobId })

    const chunkRepository: IChunkRepository = new (class implements IChunkRepository {
      async getAnalyzedChunks(jobId: string, chunkIndices: number[]): Promise<AnalyzedChunk[]> {
        const ports = getStoragePorts()
        const out: AnalyzedChunk[] = []
        for (const idx of chunkIndices) {
          const obj = await ports.analysis.getAnalysis(jobId, idx)
          if (obj) {
            const data = JSON.parse(obj.text) as {
              analysis?: import('@/types/episode').NarrativeAnalysisInput['chunks'][number]['analysis']
            }
            if (data.analysis) {
              out.push({ chunkIndex: idx, analysis: data.analysis })
            }
          }
        }
        return out
      }
    })()

    try {
      // ジョブの開始をログ
      await this.jobService.updateStep(jobId, 'episode')

      const job = await this.jobService.getJobWithProgress(jobId)
      if (!job) {
        throw new Error(`Job ${jobId} not found`)
      }

      this.logger.info('Job found', {
        id: job.id,
        totalChunks: job.totalChunks,
      })

      // 既存の進捗を取得、または新規作成
      let progress = job.progress || this.createInitialProgress(job.totalChunks || 0)

      // ステータスを処理中に更新
      await this.jobService.updateStatus(jobId, 'processing')
      await this.jobService.updateStep(jobId, 'episode', 0, job.totalChunks || 0)
      while (!progress.isCompleted) {
        // 次のバッチ範囲を計算
        const startIndex = progress.processedChunks
        const endIndex = Math.min(startIndex + this.config.chunksPerBatch, progress.totalChunks)

        this.logger.info('Processing chunks', { jobId, startIndex, endIndex })
        await this.jobService.updateStep(jobId, `episode`, startIndex, progress.totalChunks)

        // チャンクの存在確認のみ実行（実際のデータ読み込みはprepareNarrativeAnalysisInputで行う）
        for (let i = startIndex; i < endIndex; i++) {
          this.logger.debug('Verifying chunk', { chunkIndex: i })
          try {
            const ports = getStoragePorts()
            const chunkData = await (await ports).chunk.getChunk(jobId, i)
            if (!chunkData) {
              const error = `Chunk ${i} not found for job ${jobId}`
              this.logger.error('Chunk missing', {
                error,
                jobId,
                chunkIndex: i,
              })
              await this.jobService.updateError(jobId, error, `loading_chunk_${i}`, true)
              throw new Error(error)
            }
            this.logger.debug('Chunk verified', {
              chunkIndex: i,
              length: chunkData.text.length,
            })
          } catch (error) {
            const errorMsg = `Failed to verify chunk ${i}: ${error instanceof Error ? error.message : String(error)}`
            this.logger.error('Chunk verify failed', {
              error: errorMsg,
              chunkIndex: i,
            })
            await this.jobService.updateError(jobId, errorMsg, `loading_chunk_${i}`)
            throw new Error(errorMsg)
          }
        }

        const narrativeInput = await prepareNarrativeAnalysisInput({
          jobId: jobId,
          startChunkIndex: startIndex,
          targetChars: this.config.targetCharsPerEpisode,
          minChars: this.config.minCharsPerEpisode,
          maxChars: this.config.maxCharsPerEpisode,
        })

        if (!narrativeInput) {
          throw new Error(
            `No narrative input could be prepared for chunks ${startIndex}-${endIndex}`,
          )
        }

        // NarrativeAnalysisInputをNarrativeAnalysisParamsに変換
        const analysisParams = {
          jobId: narrativeInput.jobId,
          chunks: (narrativeInput.chunks || []).map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            analysis: chunk.analysis,
          })),
          targetCharsPerEpisode:
            narrativeInput.targetCharsPerEpisode || this.config.targetCharsPerEpisode,
          minCharsPerEpisode: narrativeInput.minCharsPerEpisode || this.config.minCharsPerEpisode,
          maxCharsPerEpisode: narrativeInput.maxCharsPerEpisode || this.config.maxCharsPerEpisode,
          startingEpisodeNumber: undefined,
          isMiddleOfNovel: startIndex > 0,
          previousEpisodeEndText: undefined,
        }

        // リトライ付きでナラティブアーク分析を実行
        const analysisResult = await this.executeWithRetry(
          () => analyzeNarrativeArc(analysisParams, chunkRepository),
          `Narrative arc analysis for chunks ${startIndex}-${endIndex}`,
        )

        // エピソード境界を現在のバッチに適用
        const newEpisodes = this.convertBoundariesToEpisodes(analysisResult, jobId)

        // 進捗を更新
        progress = this.updateProgress(progress, newEpisodes, endIndex)

        // データベースに保存
        await this.jobService.updateProgress(jobId, progress)
        if (newEpisodes.length > 0) {
          await this.episodeService.bulkUpsert(newEpisodes)
        }

        // コールバック
        if (onProgress) {
          onProgress(progress)
        }
      }

      // 処理完了
      await this.jobService.updateStatus(jobId, 'completed')
      return progress
    } catch (error) {
      // エラー時の処理
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      this.logger.error('Fatal error', {
        jobId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })

      await this.jobService.updateError(jobId, errorMessage, 'episode_failed', true)
      throw error
    } finally {
      this.logger.info('Episode analysis completed', { jobId })
    }
  }

  /**
   * 初期進捗を作成
   */
  private createInitialProgress(totalChunks: number): JobProgress {
    return {
      currentStep: 'episode',
      totalChunks,
      processedChunks: 0,
      episodes: [],
      isCompleted: false,
    }
  }

  /**
   * 境界情報をエピソードに変換
   */
  private convertBoundariesToEpisodes(
    boundaries: EpisodeBoundary[],
    jobId: string,
  ): Array<Omit<NewEpisode, 'id' | 'createdAt'>> {
    const episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>> = []

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i]

      episodes.push({
        novelId: jobId,
        jobId,
        episodeNumber: boundary.episodeNumber,
        title: boundary.title || null,
        summary: boundary.summary || null,
        startChunk: boundary.startChunk,
        startCharIndex: boundary.startCharIndex,
        endChunk: boundary.endChunk,
        endCharIndex: boundary.endCharIndex,
        estimatedPages: boundary.estimatedPages,
        confidence: boundary.confidence,
      })
    }

    return episodes
  }

  /**
   * 進捗を更新
   */
  private updateProgress(
    progress: JobProgress,
    newEpisodes: Array<{
      episodeNumber: number
      startChunk: number
      startCharIndex: number
      endChunk: number
      endCharIndex: number
      estimatedPages: number
      confidence: number
      title?: string | null
      summary?: string | null
    }>,
    newChunkIndex: number,
  ): JobProgress {
    const lastEpisode = newEpisodes[newEpisodes.length - 1]

    return {
      ...progress,
      processedChunks: newChunkIndex,
      episodes: [
        ...progress.episodes,
        ...newEpisodes.map((ep) => ({
          episodeNumber: ep.episodeNumber,
          startChunk: ep.startChunk,
          endChunk: ep.endChunk,
          confidence: ep.confidence,
          title: ep.title || undefined,
          summary: ep.summary || undefined,
          startCharIndex: ep.startCharIndex,
          endCharIndex: ep.endCharIndex,
          estimatedPages: ep.estimatedPages,
        })),
      ],
      lastEpisodeEndPosition: lastEpisode
        ? {
            chunkIndex: lastEpisode.endChunk,
            charIndex: lastEpisode.endCharIndex,
            episodeNumber: lastEpisode.episodeNumber,
          }
        : progress.lastEpisodeEndPosition,
      isCompleted: newChunkIndex >= progress.totalChunks,
    }
  }

  /**
   * ジョブの処理を再開可能かチェック
   */
  async canResumeJob(jobId: string): Promise<boolean> {
    const job = await this.jobService.getJobWithProgress(jobId)
    return (
      job !== null &&
      job.status !== 'completed' &&
      job.progress !== null &&
      !job.progress.isCompleted
    )
  }

  /**
   * リトライ付きで処理を実行
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error
        this.logger.warn('Operation failed', {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          error: error instanceof Error ? error.message : String(error),
        })

        // リトライ可能なエラーかチェック
        if (!this.isRetryableError(error)) {
          throw error
        }

        // 最後の試行でなければ待機
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.getRetryDelay(error, attempt)
          this.logger.info('Retrying operation', {
            operation: operationName,
            delayMs: delay,
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.config.maxRetries} attempts`)
  }

  /**
   * エラーがリトライ可能かチェック
   */
  private isRetryableError(error: unknown): boolean {
    // 公式の型ガードで判定。上位互換で 'retryable' フラグも許容
    if (isRetryableError(error)) return true
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('timeout')) return true
      if (msg.includes('network') || msg.includes('fetch')) return true
      if (msg.includes('rate limit') || msg.includes('429')) return true
      if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return true
    }
    return false
  }

  /**
   * リトライ遅延時間を計算
   */
  private getRetryDelay(error: unknown, attempt: number): number {
    // RetryableErrorでretryAfterが指定されている場合
    if (error && typeof error === 'object' && 'retryAfter' in error) {
      const retryableError = error as RetryableError
      if (retryableError.retryAfter) {
        return retryableError.retryAfter
      }
    }

    // 指数バックオフ
    return this.config.retryDelay * 2 ** attempt
  }
}
