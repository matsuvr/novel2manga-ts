import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import { getAppConfigWithOverrides } from '@/config'
import { alignEpisodesToPages, bundleEpisodesByActualPageCount } from '@/services/application/layout-pipeline/helpers'
import { db } from '@/services/database'
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
    const { jobId, novelId, logger } = context

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

      // Pipeline-level invariant guard (defense in depth):
      // 全ての最終ページ以外について、元スクリプト上の importance 累計が 6 以上であることを検証する。
      try {
        const panels = pageBreakPlan.panels || []
        if (panels.length > 0 && script.panels?.length) {
          const byPage = new Map<number, typeof panels>()
          for (const p of panels as typeof panels) {
            const arr = byPage.get(p.pageNumber)
            if (arr) arr.push(p)
            else byPage.set(p.pageNumber, [p])
          }
          const maxPage = Math.max(...Array.from(byPage.keys()))
          for (const [pageNo, pagePanels] of byPage.entries()) {
            if (pageNo === maxPage) continue
            let sum = 0
            for (const pb of pagePanels) {
              const original = script.panels[pb.panelIndex - 1]
              if (original) {
                const imp = Math.max(1, Math.min(6, original.importance || 1))
                sum += imp
              }
            }
            if (sum < 6) {
              throw new Error(`Importance invariant violated at pipeline: page ${pageNo} total=${sum} (<6)`) // will be caught below
            }
          }
        }
      } catch (invErr) {
        logger.error('Page importance invariant failed', {
          jobId,
          error: invErr instanceof Error ? invErr.message : String(invErr),
        })
        throw invErr
      }

      logger.info('Importance-based page break estimation completed', {
        jobId,
        totalPages:
          segmentedResult.segmentationInfo.totalPanels > 0
            ? Math.max(...pageBreakPlan.panels.map((p) => p.pageNumber), 1)
            : 0,
        segmentationInfo: segmentedResult.segmentationInfo,
      })

      // Align episode boundaries to page boundaries (no cross-page episodes)
      const totalPanels = script.panels?.length || 0
  const alignedEpisodes = alignEpisodesToPages(episodeBreaks, pageBreakPlan, totalPanels)

      logger.info('Episode boundaries aligned to page boundaries', {
        jobId,
        originalEpisodes: episodeBreaks.episodes.map((e) => ({
          no: e.episodeNumber,
          range: `${e.startPanelIndex}-${e.endPanelIndex}`,
        })),
        alignedEpisodes: alignedEpisodes.episodes.map((e) => ({
          no: e.episodeNumber,
          range: `${e.startPanelIndex}-${e.endPanelIndex}`,
        })),
      })

      // Bundle short episodes based on actual page counts after page break estimation
      const appCfg = getAppConfigWithOverrides()
      const bundledEpisodes = bundleEpisodesByActualPageCount(
        alignedEpisodes,
        pageBreakPlan,
        {
          minPageCount: appCfg.episodeBundling.minPageCount,
          enabled: appCfg.episodeBundling.enabled,
        },
        context,
      )

      logger.info('Episodes bundled based on actual page counts', {
        jobId,
        minPageCount: appCfg.episodeBundling.minPageCount,
        before: alignedEpisodes.episodes.length,
        after: bundledEpisodes.episodes.length,
      })

      // Generate layouts for each episode
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const layoutStorage = await StorageFactory.getLayoutStorage()

      const allPages: MangaLayout['pages'] = []
      let successfulUpserts = 0
      let failedUpserts = 0

      for (const episode of bundledEpisodes.episodes) {
        // Filter panels for this episode
        const episodePanels = pageBreakPlan.panels
          .map((p, idx) => ({ p, idx: idx + 1 }))
          .filter(({ idx }) => idx >= episode.startPanelIndex && idx <= episode.endPanelIndex)
          .map(({ p }) => p)

        // Normalize page numbers to start from 1 within the episode
        const pageOrder = Array.from(new Set(episodePanels.map((p) => p.pageNumber))).sort(
          (a, b) => a - b,
        )
        const pageMap = new Map<number, number>()
        pageOrder.forEach((pg, i) => pageMap.set(pg, i + 1))
        const remappedPanels = episodePanels.map((p) => ({
          ...p,
          pageNumber: pageMap.get(p.pageNumber) || 1,
        }))

        // Build layout for this episode
        const episodeLayout = buildLayoutFromPageBreaks(
          { panels: remappedPanels },
          {
            title: episode.title || `Episode ${episode.episodeNumber}`,
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
          },
        )

        allPages.push(...episodeLayout.pages)

        logger.info('Generated layout for episode', {
          jobId,
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.title,
          pagesInEpisode: episodeLayout.pages.length,
        })

        // Persist per-episode layout JSON to storage for downstream rendering/export
        try {
          const key = StorageKeys.episodeLayout({
            novelId,
            jobId,
            episodeNumber: episode.episodeNumber,
          })
          await layoutStorage.put(key, JSON.stringify(episodeLayout, null, 2), {
            contentType: 'application/json; charset=utf-8',
            jobId,
            novelId,
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
        // 旧実装は episode 内で 1..M にリセットされた page_number を sort し episodes を interleave させていた。
        // Legacy Step でも LayoutPipeline と同様に挿入順を保持しグローバル連番を再付与。
        pages: allPages.map((p, idx) => ({ page_number: idx + 1, panels: p.panels })),
        episodes: bundledEpisodes.episodes,
      }

      await layoutStorage.put(
        JsonStorageKeys.fullPages({ novelId, jobId }),
        JSON.stringify(fullPagesData, null, 2),
        {
          contentType: 'application/json; charset=utf-8',
          jobId,
          novelId,
        },
      )

      logger.info('Saved combined full_pages.json', {
        jobId,
        totalPages: allPages.length,
        totalEpisodes: bundledEpisodes.episodes.length,
      })

      // Persist bundled episode boundaries to DB so UI and downstream steps
      // always observe the post-bundling episode layout (fixes stale pre-bundle episodes)
      try {
        const jobRow = await db.jobs().getJob(jobId)
        if (jobRow) {
          const totalChunks = jobRow.totalChunks ?? 0
          const { buildPanelToChunkMapping, getChunkForPanel } = await import(
            '@/services/application/panel-to-chunk-mapping',
          )

          const panelToChunkMapping = await buildPanelToChunkMapping(
            context.novelId,
            jobId,
            totalChunks,
            logger,
          )

          const { EpisodeWriteService } = await import('@/services/application/episode-write')
          const episodeWriter = new EpisodeWriteService()

          const episodesForDb = bundledEpisodes.episodes.map((ep) => {
            const startChunk = getChunkForPanel(panelToChunkMapping, ep.startPanelIndex)
            const endChunk = getChunkForPanel(panelToChunkMapping, ep.endPanelIndex)
            return {
              novelId: jobRow.novelId,
              jobId,
              episodeNumber: ep.episodeNumber,
              title: ep.title,
              summary: undefined,
              startChunk,
              startCharIndex: 0,
              endChunk,
              endCharIndex: 0,
              startPanelIndex: ep.startPanelIndex,
              endPanelIndex: ep.endPanelIndex,
              confidence: 1,
            }
          })

          // Replace DB episodes for this job with the bundled set
          await episodeWriter.bulkReplaceByJobId(episodesForDb)
          logger.info('Persisted bundled episodes to DB', {
            jobId,
            persisted: episodesForDb.length,
          })
        } else {
          logger.warn('Job row not found; skipping episode persistence for bundled episodes', {
            jobId,
          })
        }
      } catch (persistErr) {
        logger.warn('Failed to persist bundled episodes to DB', {
          jobId,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        })
      }

      // Log upsert summary
      logger.info('Layout status upsert summary', {
        jobId,
        totalEpisodes: bundledEpisodes.episodes.length,
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

// 重複ヘルパーは helpers.ts に抽出済み
