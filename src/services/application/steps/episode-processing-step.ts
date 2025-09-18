import type { Chunk } from '@/db/schema'
import { getChunkRepository } from '@/repositories'
import { db } from '@/services/database'
import type { EpisodeBoundary } from '@/types/episode'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface EpisodeTextResult {
  episodeText: string
}

/**
 * Step responsible for episode text extraction and storage
 */
export class EpisodeProcessingStep implements PipelineStep {
  readonly stepName = 'episode-processing'

  /**
   * Extract episode text from stored chunks
   */
  async extractEpisodeText(
    episodeNumber: number,
    _boundaries: EpisodeBoundary[],
    context: StepContext,
  ): Promise<StepExecutionResult<EpisodeTextResult>> {
    const { jobId, logger } = context

    try {
      // ここで「DBからエピソード情報を読み込む」
      logger.info('Fetching episodes from database', { jobId })
      const episodes = await db.episodes().getEpisodesByJobId(jobId)
      logger.info('Episodes fetched from database', {
        jobId,
        foundEpisodes: episodes.length,
        episodeNumbers: episodes.map((e) => e.episodeNumber),
      })

      const episode = episodes.find((e) => e.episodeNumber === episodeNumber)
      if (!episode) {
        logger.error('Episode not found in database', {
          jobId,
          searchingFor: episodeNumber,
          availableEpisodes: episodes.map((e) => e.episodeNumber),
        })
        return { success: false, error: `Episode ${episodeNumber} not found` }
      }

      logger.info('Episode found, starting processing', { jobId, episodeNumber })

      // Get chunk metadata for text extraction
      const chunkRepo = getChunkRepository()
      logger.info('DEBUG: Querying chunks for episode processing', { jobId })
      const chunksMetadata = await chunkRepo.getByJobId(jobId)
      logger.info('DEBUG: Chunks query result for episode processing', {
        jobId,
        chunksFound: chunksMetadata.length,
        chunkSample: chunksMetadata.slice(0, 2).map((c) => ({
          chunkIndex: (c as Chunk).chunkIndex,
          contentPath: (c as Chunk).contentPath,
          jobId: (c as Chunk).jobId,
        })),
      })

      if (chunksMetadata.length === 0) {
        logger.error('No chunks found for episode processing', { jobId })
        return {
          success: false,
          error: `Chunk data missing for job ${jobId}`,
        }
      }

      const result = await this.extractFromChunks(
        episode,
        episodeNumber,
        chunksMetadata as Chunk[],
        context,
      )
      if (!result.success) return result
      const episodeText = result.data.episodeText

      // Store episode text atomically with DB path update
      await this.storeEpisodeText(episodeText, episodeNumber, context)

      return {
        success: true,
        data: { episodeText },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to extract episode text', { jobId, episodeNumber, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  private async extractFromChunks(
    episode: { startChunk: number; endChunk: number; startCharIndex: number; endCharIndex: number },
    episodeNumber: number,
    chunksMetadata: Chunk[],
    context: StepContext,
  ): Promise<StepExecutionResult<{ episodeText: string }>> {
    const { jobId, novelId, logger, ports } = context

    // Validate episode boundaries
    if (episode.startChunk < 0 || episode.endChunk < 0 || episode.startChunk > episode.endChunk) {
      const errorMessage = `Invalid episode boundaries for episode ${episodeNumber}: startChunk=${episode.startChunk}, endChunk=${episode.endChunk}`
      logger.error('Invalid episode boundaries detected', {
        jobId,
        episodeNumber,
        startChunk: episode.startChunk,
        endChunk: episode.endChunk,
        startCharIndex: episode.startCharIndex,
        endCharIndex: episode.endCharIndex,
      })
      return { success: false, error: errorMessage }
    }

    logger.info('Starting episode text extraction', {
      jobId,
      episodeNumber,
      totalChunksInJob: chunksMetadata.length,
      episodeStartChunk: episode.startChunk,
      episodeEndChunk: episode.endChunk,
      episodeStartChar: episode.startCharIndex,
      episodeEndChar: episode.endCharIndex,
    })

    // Clamp episode boundaries to available chunk indices
    const availableIndices = chunksMetadata.map((c) => c.chunkIndex).sort((a, b) => a - b)
    const minIdx = availableIndices.length > 0 ? availableIndices[0] : 0
    const maxIdx = availableIndices.length > 0 ? availableIndices[availableIndices.length - 1] : 0
    const adjStartChunk = Math.max(minIdx, Math.min(maxIdx, episode.startChunk))
    const adjEndChunk = Math.max(adjStartChunk, Math.min(maxIdx, episode.endChunk))

    if (adjStartChunk !== episode.startChunk || adjEndChunk !== episode.endChunk) {
      logger.warn('Adjusted episode chunk boundaries to available range', {
        jobId,
        episodeNumber,
        originalStartChunk: episode.startChunk,
        originalEndChunk: episode.endChunk,
        adjustedStartChunk: adjStartChunk,
        adjustedEndChunk: adjEndChunk,
        availableIndices,
      })
    }

    let episodeText = ''
    let processedChunks = 0

    for (const chunkMeta of chunksMetadata) {
      const chunk = chunkMeta as Chunk
      logger.info('Processing chunk metadata', {
        jobId,
        episodeNumber,
        chunkIndex: chunk.chunkIndex,
        episodeStartChunk: adjStartChunk,
        episodeEndChunk: adjEndChunk,
        isInRange: chunk.chunkIndex >= adjStartChunk && chunk.chunkIndex <= adjEndChunk,
      })

      if (chunk.chunkIndex >= adjStartChunk && chunk.chunkIndex <= adjEndChunk) {
        // Get actual chunk text from storage
        // ここで「ストレージ（ファイル）から対象チャンク本文を読み込む」
        const chunkContent = await ports.chunk.getChunk(novelId, jobId, chunk.chunkIndex)
        if (!chunkContent?.text) {
          return {
            success: false,
            error: `Chunk content not found for job ${jobId}, chunk ${chunk.chunkIndex}`,
          }
        }

        const startIndexRaw = chunk.chunkIndex === adjStartChunk ? episode.startCharIndex : 0
        const startIndex = Math.max(0, Math.min(chunkContent.text.length, startIndexRaw))

        // endIndex calculation for the chunk
        const endIndexRaw =
          chunk.chunkIndex === adjEndChunk ? episode.endCharIndex : chunkContent.text.length
        const endIndex = Math.max(0, Math.min(chunkContent.text.length, endIndexRaw))

        // guard: ensure non-negative length
        const safeStart = Math.min(startIndex, endIndex)
        const safeEnd = Math.max(endIndex, startIndex)

        const extractedText = chunkContent.text.substring(safeStart, safeEnd)
        episodeText += extractedText
        processedChunks++

        logger.info('Extracted text from chunk', {
          jobId,
          episodeNumber,
          chunkIndex: chunk.chunkIndex,
          chunkTextLength: chunkContent.text.length,
          extractedLength: extractedText.length,
          startIndex: safeStart,
          endIndex: safeEnd,
          extractedPreview: `${extractedText.substring(0, 50)}...`,
        })
      }
    }

    logger.info('Episode text extraction completed', {
      jobId,
      episodeNumber,
      processedChunks,
      totalEpisodeTextLength: episodeText.length,
    })

    // Validate episode text before script conversion
    if (!episodeText || episodeText.trim().length === 0) {
      const errorMessage = `Episode text is empty for episode ${episodeNumber}. Received: "${episodeText}" (startChunk=${episode.startChunk}, endChunk=${episode.endChunk}, startCharIndex=${episode.startCharIndex}, endCharIndex=${episode.endCharIndex})`
      logger.error('Empty episode text detected', {
        jobId,
        episodeNumber,
        episodeTextLength: episodeText.length,
        episodeStartChunk: episode.startChunk,
        episodeEndChunk: episode.endChunk,
        episodeStartChar: episode.startCharIndex,
        episodeEndChar: episode.endCharIndex,
        chunksFound: chunksMetadata.length,
        processedChunks,
        allChunkIndices: chunksMetadata.map((c) => c.chunkIndex),
        adjustedStartChunk: adjStartChunk,
        adjustedEndChunk: adjEndChunk,
      })
      return { success: false, error: errorMessage }
    }

    if (processedChunks === 0) {
      const errorMessage = `No chunks were processed for episode ${episodeNumber}. This indicates episode boundaries don't match available chunks.`
      logger.error('No chunks processed for episode', {
        jobId,
        episodeNumber,
        episodeStartChunk: episode.startChunk,
        episodeEndChunk: episode.endChunk,
        availableChunkIndices: chunksMetadata.map((c) => c.chunkIndex),
      })
      return { success: false, error: errorMessage }
    }

    return { success: true, data: { episodeText } }
  }

  private async storeEpisodeText(
    episodeText: string,
    episodeNumber: number,
    context: StepContext,
  ): Promise<void> {
    const { novelId, jobId, logger } = context

    const storageModule = await import('@/utils/storage')
    const storage = await storageModule.StorageFactory.getAnalysisStorage()
    const key =
      typeof (storageModule.StorageKeys as unknown as Record<string, unknown>).episodeText ===
      'function'
        ? (
            storageModule.StorageKeys as unknown as {
              episodeText: (params: {
                novelId: string
                jobId: string
                episodeNumber: number
              }) => string
            }
          ).episodeText({ novelId, jobId, episodeNumber })
        : `${novelId}/jobs/${jobId}/analysis/episode_${episodeNumber}.txt`

    const { executeStorageWithDbOperation } = await import(
      '@/services/application/transaction-manager'
    )

    // エピソード本文の保存をストレージ+DB一体のトランザクションで実行（強整合性）
    await executeStorageWithDbOperation({
      storage,
      key,
      value: episodeText,
      metadata: {
        contentType: 'text/plain; charset=utf-8',
        jobId,
        novelId,
        episode: String(episodeNumber),
      },
      dbOperation: async () => {
        const { db } = await import('@/services/database')
        db.episodes().updateEpisodeTextPath(jobId, episodeNumber, key)
      },
      tracking: {
        filePath: key,
        fileCategory: 'episode',
        fileType: 'txt',
        novelId,
        jobId,
        mimeType: 'text/plain; charset=utf-8',
      },
    })

    logger.info('Episode text saved atomically with DB path update', {
      jobId,
      episodeNumber,
      episodeTextKey: key,
    })
  }
}
