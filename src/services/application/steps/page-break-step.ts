import { estimatePageBreaks } from '@/agents/script/page-break-estimator'
import { assignPanels, buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import type { NewMangaScript, PageBreakV2 } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface PageBreakResult {
  pageBreakPlan: PageBreakV2
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

      if (!pageBreakPlan) {
        throw new Error('Page break estimation failed: pageBreakPlan is undefined')
      }

      // PageBreakV2形式では個別のパネル制約を適用（不要なため簡素化）
      // パネルカウント制約は既にbuildLayoutFromPageBreaks内で適用済み

      // 新しい形式では、PageBreakV2から直接レイアウトを生成
      const _assignment = await assignPanels(script as NewMangaScript, pageBreakPlan, {
        jobId,
        episodeNumber,
      })

      // buildLayoutFromPageBreaks を使用してレイアウトを直接生成
      const _layoutBuilt = buildLayoutFromPageBreaks(pageBreakPlan, {
        title: `Episode ${episodeNumber}`,
        episodeNumber: episodeNumber || 1,
        episodeTitle: `Episode ${episodeNumber}`,
      })

      // Save full_pages.json for EpisodeBundlingStep
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const layoutStorage = await StorageFactory.getLayoutStorage()
      const fullPagesData = {
        title: `Episode ${episodeNumber}`,
        episodeNumber: episodeNumber || 1,
        episodeTitle: `Episode ${episodeNumber}`,
        pages: _layoutBuilt.pages,
      }

      await layoutStorage.put(
        JsonStorageKeys.fullPages(jobId),
        JSON.stringify(fullPagesData, null, 2),
        {
          contentType: 'application/json; charset=utf-8',
          jobId,
        },
      )

      logger.info('Saved full_pages.json for episode bundling', {
        jobId,
        episodeNumber,
        totalPages: _layoutBuilt.pages.length,
      })

      // 簡素化されたページ生成結果を返す
      return {
        success: true,
        data: {
          pageBreakPlan,
          totalPages: Math.max(...pageBreakPlan.panels.map((p) => p.pageNumber), 1),
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Page break estimation failed', {
        jobId: context.jobId,
        episodeNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
