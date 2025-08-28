import { convertEpisodeTextToScript } from '@/agents/script/script-converter'
import type { EpisodeBoundary } from '@/types/episode'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ScriptConversionResult {
  script: unknown // The converted script object
}

/**
 * Step responsible for converting episode text to script format
 */
export class ScriptConversionStep implements PipelineStep {
  readonly stepName = 'script-conversion'

  /**
   * Convert episode text to script format using LLM
   */
  async convertToScript(
    episodeText: string,
    episodeNumber: number,
    boundaries: EpisodeBoundary[],
    context: StepContext,
  ): Promise<StepExecutionResult<ScriptConversionResult>> {
    const { jobId, logger } = context

    try {
      // Extract structured data from narrative arc analysis for the current episode
      const currentEpisodeBoundary = boundaries.find((b) => b.episodeNumber === episodeNumber)

      logger.info('Starting script conversion', {
        jobId,
        episodeNumber,
        episodeTextLength: episodeText.length,
        hasStructuredData: !!currentEpisodeBoundary,
      })

      // Convert episode text to script
      // ここで「LLM を呼び出してエピソード本文を台本スクリプト形式に変換」
      const script = await convertEpisodeTextToScript(
        {
          episodeText,
          // Use structured data from narrative arc analysis results
          characterList: currentEpisodeBoundary?.characterList?.join('、') || undefined,
          sceneList: currentEpisodeBoundary?.sceneList?.join('、') || undefined,
          dialogueList: currentEpisodeBoundary?.dialogueList?.join('、') || undefined,
          highlightList: currentEpisodeBoundary?.highlightList?.join('、') || undefined,
          situationList: currentEpisodeBoundary?.situationList?.join('、') || undefined,
        },
        {
          jobId,
          episodeNumber,
          // フラグメント変換を無効化（処理経路の透明化のため）
          useFragmentConversion: false,
        },
      )

      logger.info('Script conversion completed', {
        jobId,
        episodeNumber,
        scriptGenerated: !!script,
      })

      return {
        success: true,
        data: { script },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Script conversion failed', {
        jobId,
        episodeNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
