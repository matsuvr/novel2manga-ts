import { getChunkingConfig } from '@/config'
import type { Chunk, Job } from '@/db/schema'
import { db } from '@/services/database'
import { splitTextIntoSlidingChunks } from '@/utils/text-splitter'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ChunkingResult {
  chunks: string[]
  totalChunks: number
}

/**
 * Step responsible for text chunking and chunk persistence
 */
export class TextChunkingStep implements PipelineStep {
  readonly stepName = 'text-chunking'

  /**
   * Split text into chunks and persist them, or load existing chunks
   */
  async processTextChunks(
    novelText: string,
    existingJob: Job | null,
    context: StepContext,
  ): Promise<StepExecutionResult<ChunkingResult>> {
    const { jobId, novelId, logger, ports } = context

    try {
      let chunks: string[] = []

      // Check if chunks already exist for resumed jobs
      if (existingJob?.splitCompleted) {
        logger.info('Split step already completed, loading existing chunks', { jobId })
        const existingChunks = await db.chunks().getChunksByJobId(jobId)
        logger.info('DEBUG: Chunk query result', {
          jobId,
          chunkCount: existingChunks.length,
          chunkSample: existingChunks.slice(0, 2).map((c) => ({
            chunkIndex: (c as Chunk).chunkIndex,
            contentPath: (c as Chunk).contentPath,
            jobId: (c as Chunk).jobId,
          })),
        })

        if (existingChunks.length === 0) {
          const errorMessage = 'Split marked complete but no chunks found'
          logger.error(errorMessage, { jobId })
          return { success: false, error: errorMessage }
        }

        // Load actual chunk text from storage for resumed jobs.
        // Previously this returned an array of empty strings which caused
        // downstream prompts to be empty and led to LLM SDK errors
        // (e.g. "contents are required").
        chunks = await Promise.all(
          existingChunks.map(async (c) => {
            try {
              const stored = await ports.chunk.getChunk(
                novelId,
                jobId,
                (c as Chunk).chunkIndex,
              )
              return stored?.text ?? ''
            } catch (e) {
              logger.warn(
                'Failed to load chunk content from storage for resumed job, inserting empty string',
                {
                  jobId,
                  chunkIndex: (c as Chunk).chunkIndex,
                  error: e instanceof Error ? e.message : String(e),
                },
              )
              return ''
            }
          }),
        )

        logger.info('Loaded existing chunks from storage', {
          jobId,
          chunkCount: chunks.length,
        })

        return {
          success: true,
          data: {
            chunks,
            totalChunks: chunks.length,
          },
        }
      }

      // Create new chunks
      if (chunks.length === 0) {
        // 機械的な固定長チャンク分割（オーバーラップ付き）
        // Rationale: sentence-based splitting caused instability across languages and inconsistent
        // segment sizes; sliding window chunking yields predictable boundaries and better LLM context
        // continuity, especially for Japanese text without clear punctuation.
        const chunkCfg = getChunkingConfig()
        // ここで「小説本文を固定長で分割（メモリ内処理。I/Oなし）」
        chunks = splitTextIntoSlidingChunks(
          novelText,
          chunkCfg.defaultChunkSize,
          chunkCfg.defaultOverlapSize,
          {
            minChunkSize: chunkCfg.minChunkSize,
            maxChunkSize: chunkCfg.maxChunkSize,
            maxOverlapRatio: chunkCfg.maxOverlapRatio,
          },
        )

        logger.info('Text split into chunks', {
          jobId,
          totalChunks: chunks.length,
          chunkConfig: chunkCfg,
        })

        // 端数吸収: 最終チャンクが閾値未満の場合は直前チャンクに連結
        // - 閾値には chunkCfg.minChunkSize を利用
        // - オーバーラップ分の重複を避けるため、前チャンクの開始位置を再計算し、原文から再スライスする
        try {
          const size = Math.max(
            Math.max(1, chunkCfg.minChunkSize),
            Math.min(chunkCfg.defaultChunkSize, chunkCfg.maxChunkSize),
          )
          const ov = Math.min(
            Math.floor(size * (chunkCfg.maxOverlapRatio ?? 0.5)),
            Math.max(0, chunkCfg.defaultOverlapSize),
          )
          const stride = Math.max(1, size - ov)

          if (chunks.length >= 2) {
            const last = chunks[chunks.length - 1]
            if (last.length < chunkCfg.minChunkSize) {
              const len = novelText.length
              const lastStart = len - last.length
              const prevStart = Math.max(0, lastStart - stride)
              const merged = novelText.slice(prevStart, len)
              chunks.splice(chunks.length - 2, 2, merged)
              logger.info('Merged short tail chunk into previous (post-split correction)', {
                jobId,
                prevStart,
                lastStart,
                mergedLength: merged.length,
              })
            }
          }
        } catch (e) {
          logger.warn('Tail-merge correction failed (continuing with original chunks)', {
            jobId,
            error: e instanceof Error ? e.message : String(e),
          })
        }

        // Persist chunks to storage and DB immediately for強整合性
        await this.persistChunks(chunks, { jobId, novelId, logger, ports })
      }

      return {
        success: true,
        data: {
          chunks,
          totalChunks: chunks.length,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to process text chunks', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  private async persistChunks(
    chunks: string[],
    context: StepContext,
  ): Promise<StepExecutionResult<void>> {
    const { jobId, novelId, logger, ports } = context

    try {
      logger.info('DEBUG: Starting chunk persistence', { jobId, totalChunks: chunks.length })
      let currentPosition = 0

      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i]
        // ここで「ストレージ（ファイル）にチャンク本文を書き込む」
        const key = await ports.chunk.putChunk(novelId, jobId, i, content)
        const startPos = currentPosition
        const endPos = currentPosition + content.length

        // ここで「DBにチャンクメタデータを即時挿入（書き込み）」
        logger.info('DEBUG: Saving chunk to DB', {
          jobId,
          chunkIndex: i,
          contentLength: content.length,
          novelId: `${novelId.substring(0, 8)}...`,
        })

        try {
          await db.chunks().createChunk({
            novelId,
            jobId,
            chunkIndex: i,
            contentPath: key,
            startPosition: startPos,
            endPosition: endPos,
            wordCount: content.length,
          })
          logger.info('DEBUG: Chunk saved successfully', { jobId, chunkIndex: i })
        } catch (error) {
          logger.error('DEBUG: Chunk save failed', {
            jobId,
            chunkIndex: i,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
        currentPosition = endPos
      }

      logger.info('DEBUG: Chunk persistence completed', { jobId, totalSaved: chunks.length })
      return { success: true, data: undefined }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to persist chunks', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
