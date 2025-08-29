import { convertChunkToMangaScript } from '@/agents/script/script-converter'
import type { NewMangaScript } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ScriptConversionResult {
  script: NewMangaScript // The converted manga script object
}

/**
 * Step responsible for converting episode text to script format
 */
export class ScriptConversionStep implements PipelineStep {
  readonly stepName = 'script-conversion'

  /**
   * Convert chunk text to manga script format using LLM
   */
  async convertToScript(
    chunkText: string,
    chunkIndex: number,
    chunksNumber: number,
    allChunks: string[],
    context: StepContext,
  ): Promise<StepExecutionResult<ScriptConversionResult>> {
    const { jobId, logger } = context

    try {
      // Get previous and next chunks for context
      const previousText = chunkIndex > 1 ? allChunks[chunkIndex - 2] : undefined
      const nextChunk = chunkIndex < chunksNumber ? allChunks[chunkIndex] : undefined

      logger.info('Starting manga script conversion', {
        jobId,
        chunkIndex,
        chunksNumber,
        chunkTextLength: chunkText.length,
        hasPrevious: !!previousText,
        hasNext: !!nextChunk,
      })

      // Convert chunk text to manga script using new format
      const script = await convertChunkToMangaScript(
        {
          chunkText,
          chunkIndex,
          chunksNumber,
          previousText,
          nextChunk,
        },
        {
          jobId,
        },
      )

      logger.info('Manga script conversion completed', {
        jobId,
        chunkIndex,
        chunksNumber,
        scriptGenerated: !!script,
        panelsCount: script?.panels?.length || 0,
      })

      return {
        success: true,
        data: { script },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Manga script conversion failed', {
        jobId,
        chunkIndex,
        chunksNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
