import { extractSpeakerAndText } from '@/agents/script/dialogue-utils'
import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import { db } from '@/services/database/index'
import type { MangaLayout } from '@/types/panel-layout'
import type { EpisodeBreakPlan, NewMangaScript, PageBreakV2 } from '@/types/script'
import { StorageKeys } from '@/utils/storage'
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
   * Estimate page breaks using importance-based calculation and store layout plan
   */
  async estimatePageBreaks(
    script: NewMangaScript,
    episodeBreaks: EpisodeBreakPlan,
    context: StepContext,
  ): Promise<StepExecutionResult<PageBreakResult>> {
    const { jobId, logger } = context

    try {
      logger.info('Starting importance-based page break estimation', {
        jobId,
        totalEpisodes: episodeBreaks.episodes.length,
        panelCount: script.panels?.length || 0,
      })

      // Use importance-based page break calculation
      const segmentedResult = await estimatePageBreaksSegmented(script, {
        jobId,
        useImportanceBased: true,
      })

      const pageBreakPlan = segmentedResult.pageBreaks

      logger.info('Importance-based page break estimation completed', {
        jobId,
        totalPages:
          segmentedResult.segmentationInfo.totalPanels > 0
            ? Math.max(...pageBreakPlan.panels.map((p) => p.pageNumber), 1)
            : 0,
        segmentationInfo: segmentedResult.segmentationInfo,
      })

      // Generate layouts for each episode
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const layoutStorage = await StorageFactory.getLayoutStorage()

      const allPages: MangaLayout['pages'] = []
      let pageOffset = 0
      let successfulUpserts = 0
      let failedUpserts = 0

      for (const episode of episodeBreaks.episodes) {
        // Filter panels for this episode
        const episodePanels = pageBreakPlan.panels
          .filter((panel) => {
            // Find the original panel number in the script
            const originalPanelIndex =
              script.panels?.findIndex((p) => {
                // content マッチ: panel.content に p.cut が含まれる（cut+camera統合後の互換）
                const contentMatch = typeof p.cut === 'string' && panel.content.includes(p.cut)

                // dialogue マッチ: 両者を正規化して話者・本文一致を確認
                const panelDialogue = Array.isArray(panel.dialogue) ? panel.dialogue : []
                const dialogueMatch = panelDialogue.some((d) => {
                  const spLines = Array.isArray(p.dialogue) ? p.dialogue : []
                  for (const spd of spLines) {
                    if (typeof spd !== 'string') continue
                    const norm = extractSpeakerAndText(spd)
                    if (norm.speaker === d.speaker && norm.text === d.text) {
                      return true
                    }
                  }
                  return false
                })

                return contentMatch || dialogueMatch
              }) || -1

            return (
              originalPanelIndex >= episode.startPanelIndex - 1 &&
              originalPanelIndex <= episode.endPanelIndex - 1
            )
          })
          .map((panel) => ({
            ...panel,
            pageNumber: panel.pageNumber + pageOffset,
          }))

        // Build layout for this episode
        const episodeLayout = buildLayoutFromPageBreaks(
          { panels: episodePanels },
          {
            title: episode.title || `Episode ${episode.episodeNumber}`,
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
          },
        )

        allPages.push(...episodeLayout.pages)
        pageOffset += Math.max(...episodePanels.map((p) => p.pageNumber), 0)

        logger.info('Generated layout for episode', {
          jobId,
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.title,
          pagesInEpisode: episodeLayout.pages.length,
        })

        // Persist per-episode layout JSON to storage for downstream rendering/export
        try {
          const key = StorageKeys.episodeLayout(jobId, episode.episodeNumber)
          await layoutStorage.put(key, JSON.stringify(episodeLayout, null, 2), {
            contentType: 'application/json; charset=utf-8',
            jobId,
            episode: String(episode.episodeNumber),
          })
          // Upsert layout status per episode for accurate progress and export discovery
          try {
            db.layout().upsertLayoutStatus({
              jobId,
              episodeNumber: episode.episodeNumber,
              totalPages: episodeLayout.pages.length,
              totalPanels: episodePanels.length,
              layoutPath: key,
            })
            successfulUpserts++
            logger.info('Layout status upserted successfully', {
              jobId,
              episodeNumber: episode.episodeNumber,
              totalPages: episodeLayout.pages.length,
              totalPanels: episodePanels.length,
              layoutPath: key,
            })
          } catch (statusError) {
            failedUpserts++
            const errorMessage =
              statusError instanceof Error ? statusError.message : String(statusError)
            const errorStack = statusError instanceof Error ? statusError.stack : undefined
            logger.warn('Failed to upsert layout status for episode', {
              jobId,
              episodeNumber: episode.episodeNumber,
              error: errorMessage,
              stack: errorStack,
              layoutPath: key,
              totalPages: episodeLayout.pages.length,
              totalPanels: episodePanels.length,
            })
          }
        } catch (persistError) {
          logger.error('Failed to persist per-episode layout', {
            jobId,
            episodeNumber: episode.episodeNumber,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          })
          throw persistError
        }
      }

      // Save combined full_pages.json
      const fullPagesData = {
        title: 'Combined Episodes',
        episodeNumber: 1,
        episodeTitle: 'Combined Episodes',
        pages: allPages,
        episodes: episodeBreaks.episodes,
      }

      await layoutStorage.put(
        JsonStorageKeys.fullPages(jobId),
        JSON.stringify(fullPagesData, null, 2),
        {
          contentType: 'application/json; charset=utf-8',
          jobId,
        },
      )

      logger.info('Saved combined full_pages.json', {
        jobId,
        totalPages: allPages.length,
        totalEpisodes: episodeBreaks.episodes.length,
      })

      // Log upsert summary
      logger.info('Layout status upsert summary', {
        jobId,
        totalEpisodes: episodeBreaks.episodes.length,
        successfulUpserts,
        failedUpserts,
        upsertSuccessRate: successfulUpserts / (successfulUpserts + failedUpserts),
      })

      return {
        success: true,
        data: {
          pageBreakPlan,
          totalPages: allPages.length,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Page break estimation failed', {
        jobId: context.jobId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
