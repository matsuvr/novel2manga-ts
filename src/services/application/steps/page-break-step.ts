import { estimatePageBreaks } from '@/agents/script/page-break-estimator'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakPlan } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface PageBreakResult {
  pageBreakPlan: PageBreakPlan
  totalPages: number
}

/**
 * Step responsible for page break estimation and layout storage
 */
export class PageBreakStep implements PipelineStep {
  readonly stepName = 'page-break'

  /**
   * Estimate page breaks and store layout plan
   */
  async estimatePageBreaks(
    script: unknown,
    episodeNumber: number,
    context: StepContext,
  ): Promise<StepExecutionResult<PageBreakResult>> {
    const { jobId, logger } = context

    try {
      logger.info('Starting page break estimation', {
        jobId,
        episodeNumber,
      })

      // Estimate page breaks using advanced LLM without mechanical page count logic
      // ここで「LLM（またはエージェント）を呼び出してページ割り（コマ割り）を推定」
      const pageBreakPlan = await estimatePageBreaks(
        script as Parameters<typeof estimatePageBreaks>[0],
        {
          jobId,
          episodeNumber,
        },
      )

      // Store page break plan
      const ports = getStoragePorts()
      // ここで「ストレージ（ファイル）にページ割り計画を JSON として書き込む」
      await ports.layout.putEpisodeLayout(
        jobId,
        episodeNumber,
        JSON.stringify(pageBreakPlan, null, 2),
      )

      // Count total pages for this episode
      const totalPages = pageBreakPlan.pages.length

      logger.info('Page break estimation completed', {
        jobId,
        episodeNumber,
        pagesInEpisode: totalPages,
      })

      return {
        success: true,
        data: {
          pageBreakPlan,
          totalPages,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Page break estimation failed', {
        jobId,
        episodeNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
