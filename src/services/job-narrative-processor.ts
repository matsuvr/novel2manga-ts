import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { getEpisodeConfig } from '@/config'
import type { Episode } from '@/db'
import type { DatabaseService } from '@/services/database'
import type { EpisodeBoundary } from '@/types/episode'
import type { JobProgress } from '@/types/job'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { getChunkData } from '@/utils/storage'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'

export interface RetryableError extends Error {
  retryable: boolean
  retryAfter?: number
}

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
    private dbService: DatabaseService,
    config?: Partial<NarrativeProcessorConfig>,
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
    console.log(`[JobNarrativeProcessor] Starting episode analysis for job ${jobId}`)

    const chunkRepository = new StorageChunkRepository()

    try {
      // ジョブの開始をログ
      await this.dbService.updateJobStep(jobId, 'episode_started')

      const job = await this.dbService.getJobWithProgress(jobId)
      if (!job) {
        throw new Error(`Job ${jobId} not found`)
      }

      console.log(`[JobNarrativeProcessor] Job found: ${job.id}, total chunks: ${job.totalChunks}`)

      // 既存の進捗を取得、または新規作成
      let progress = job.progress || this.createInitialProgress(job.totalChunks || 0)

      // ステータスを処理中に更新
      await this.dbService.updateJobStatus(jobId, 'processing')
      await this.dbService.updateJobStep(jobId, 'processing_chunks', 0, job.totalChunks || 0)
      while (!progress.isCompleted) {
        // 次のバッチ範囲を計算
        const startIndex = progress.processedChunks
        const endIndex = Math.min(startIndex + this.config.chunksPerBatch, progress.totalChunks)

        console.log(
          `[JobNarrativeProcessor] Processing chunks ${startIndex} to ${endIndex} for job ${jobId}`,
        )
        await this.dbService.updateJobStep(
          jobId,
          `processing_batch_${startIndex}_${endIndex}`,
          startIndex,
          progress.totalChunks,
        )

        // チャンクの存在確認のみ実行（実際のデータ読み込みはprepareNarrativeAnalysisInputで行う）
        for (let i = startIndex; i < endIndex; i++) {
          console.log(`[JobNarrativeProcessor] Verifying chunk ${i}`)
          try {
            const chunkData = await getChunkData(jobId, i)
            if (!chunkData) {
              const error = `Chunk ${i} not found for job ${jobId}`
              console.error(`[JobNarrativeProcessor] ${error}`)
              await this.dbService.updateJobError(jobId, error, `loading_chunk_${i}`)
              throw new Error(error)
            }
            console.log(
              `[JobNarrativeProcessor] Chunk ${i} verified successfully (${chunkData.text.length} chars)`,
            )
          } catch (error) {
            const errorMsg = `Failed to verify chunk ${i}: ${error instanceof Error ? error.message : String(error)}`
            console.error(`[JobNarrativeProcessor] ${errorMsg}`)
            await this.dbService.updateJobError(jobId, errorMsg, `loading_chunk_${i}`)
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
        await this.dbService.updateJobProgress(jobId, progress)
        if (newEpisodes.length > 0) {
          await this.dbService.createEpisodes(newEpisodes)
        }

        // コールバック
        if (onProgress) {
          onProgress(progress)
        }
      }

      // 処理完了
      await this.dbService.updateJobStatus(jobId, 'completed')
      return progress
    } catch (error) {
      // エラー時の処理
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error(`[JobNarrativeProcessor] Fatal error in job ${jobId}:`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        jobId,
      })

      await this.dbService.updateJobError(jobId, errorMessage, 'episode_failed')
      throw error
    } finally {
      console.log(`[JobNarrativeProcessor] Episode analysis completed for job ${jobId}`)
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
  private convertBoundariesToEpisodes(boundaries: EpisodeBoundary[], jobId: string): Episode[] {
    const episodes: Episode[] = []

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i]

      episodes.push({
        id: `${jobId}-episode-${boundary.episodeNumber}`,
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
        createdAt: new Date().toISOString(),
      })
    }

    return episodes
  }

  /**
   * 進捗を更新
   */
  private updateProgress(
    progress: JobProgress,
    newEpisodes: Episode[],
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
    const job = await this.dbService.getJobWithProgress(jobId)
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
        console.error(
          `${operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries}):`,
          error,
        )

        // リトライ可能なエラーかチェック
        if (!this.isRetryableError(error)) {
          throw error
        }

        // 最後の試行でなければ待機
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.getRetryDelay(error, attempt)
          console.log(`Retrying ${operationName} after ${delay}ms...`)
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
    if (error instanceof Error) {
      // タイムアウトエラー
      if (error.message.includes('timeout')) return true

      // ネットワークエラー
      if (error.message.includes('network') || error.message.includes('fetch')) return true

      // レート制限エラー
      if (error.message.includes('rate limit') || error.message.includes('429')) return true

      // 一時的なサーバーエラー
      if (
        error.message.includes('500') ||
        error.message.includes('502') ||
        error.message.includes('503')
      )
        return true

      // RetryableErrorインターフェースを実装している場合
      if ('retryable' in error && (error as RetryableError).retryable) return true
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
