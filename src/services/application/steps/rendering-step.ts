import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakPlan } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface RenderingOptions {
  isDemo?: boolean
}

export interface RenderingResult {
  rendered: boolean
  skippedReason?: string
}

/**
 * Step responsible for rendering pages from layout plans
 */
export class RenderingStep implements PipelineStep {
  readonly stepName = 'rendering'

  /**
   * Render pages for episodes or skip in demo/test environments
   */
  async renderEpisodes(
    episodeNumbers: number[],
    options: RenderingOptions,
    context: StepContext,
  ): Promise<StepExecutionResult<RenderingResult>> {
    const { jobId, logger } = context

    try {
      // デモやテスト環境では重いレンダリングをスキップ
      const shouldRender = !options.isDemo && process.env.NODE_ENV !== 'test'

      if (!shouldRender) {
        logger.warn('Skipping render in demo/test environment', {
          jobId,
          episodeCount: episodeNumbers.length,
          reason: 'Demo/test environment',
        })
        return {
          success: true,
          data: {
            rendered: false,
            skippedReason: 'Demo/test environment',
          },
        }
      }

      logger.info('Starting rendering for all episodes', {
        jobId,
        episodeCount: episodeNumbers.length,
        episodes: episodeNumbers,
      })

      try {
        // Render pages for each episode
        const ports = getStoragePorts()
        for (const ep of episodeNumbers) {
          // ここで「ストレージ（ファイル）からページ割り計画 JSON を読み込む」
          const pageBreakPlanText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (pageBreakPlanText) {
            const pageBreakPlan: PageBreakPlan = JSON.parse(pageBreakPlanText)
            const { renderFromPageBreakPlan } = await import('@/services/application/render')
            // ここで「レンダリングサービスを呼び出す（画像等を生成しストレージへ書き出す）」
            await renderFromPageBreakPlan(jobId, ep, pageBreakPlan, ports, {
              skipExisting: false,
              concurrency: 3,
            })
          }
        }
        logger.info('PageBreakPlan rendering completed for all episodes', { jobId })

        return {
          success: true,
          data: { rendered: true },
        }
      } catch (renderError) {
        const errorMessage =
          renderError instanceof Error ? renderError.message : String(renderError)
        logger.error('PageBreakPlan rendering failed', {
          jobId,
          error: errorMessage,
          stack: renderError instanceof Error ? renderError.stack : undefined,
        })
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Rendering step failed', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
