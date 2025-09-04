import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import { db } from '@/services/database/index'
import type { MangaLayout } from '@/types/panel-layout'
import type { EpisodeBreakPlan, NewMangaScript, PageBreakV2 } from '@/types/script'
import { StorageKeys } from '@/utils/storage'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'
import type { PageBreakV2 as _PageBreakV2 } from '@/types/script'

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

      // Generate layouts for each episode
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const layoutStorage = await StorageFactory.getLayoutStorage()

      const allPages: MangaLayout['pages'] = []
      let successfulUpserts = 0
      let failedUpserts = 0

      for (const episode of alignedEpisodes.episodes) {
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
        // 重要: pageNumber の二重オフセットにより番号が飛ぶ問題を避けるため、
        // ここでは各エピソード内で付与された page_number をそのまま集約し、
        // 昇順で安定化して保存する（再番号付けは行わない）
        pages: allPages.sort((a, b) => a.page_number - b.page_number),
        episodes: alignedEpisodes.episodes,
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
        totalEpisodes: alignedEpisodes.episodes.length,
      })

      // Log upsert summary
      logger.info('Layout status upsert summary', {
        jobId,
        totalEpisodes: alignedEpisodes.episodes.length,
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

// ============ Helpers for page-aligned episodes ============
interface PageRange {
  page: number
  start: number // 1-based script index inclusive
  end: number // 1-based script index inclusive
}

function buildPageRanges(pageBreakPlan: _PageBreakV2, totalPanels: number): PageRange[] {
  if (!pageBreakPlan.panels || pageBreakPlan.panels.length === 0 || totalPanels <= 0) return []
  const ranges: PageRange[] = []
  let currentPage = pageBreakPlan.panels[0].pageNumber
  let startIdx = 1
  for (let i = 1; i <= totalPanels; i++) {
    const p = pageBreakPlan.panels[i - 1]
    const page = p.pageNumber
    if (page !== currentPage) {
      ranges.push({ page: currentPage, start: startIdx, end: i - 1 })
      currentPage = page
      startIdx = i
    }
  }
  ranges.push({ page: currentPage, start: startIdx, end: totalPanels })
  return ranges
}

function pageOf(index: number, ranges: PageRange[]): number {
  for (const r of ranges) {
    if (index >= r.start && index <= r.end) return r.page
  }
  return ranges.length > 0 ? ranges[ranges.length - 1].page : 1
}

function firstIndexOfPage(page: number, ranges: PageRange[]): number {
  const r = ranges.find((x) => x.page === page)
  return r ? r.start : 1
}

function lastIndexOfPage(page: number, ranges: PageRange[]): number {
  const r = ranges.find((x) => x.page === page)
  return r ? r.end : 1
}

function alignEpisodesToPages(
  episodeBreaks: EpisodeBreakPlan,
  pageBreakPlan: _PageBreakV2,
  totalPanels: number,
): EpisodeBreakPlan {
  if (!episodeBreaks.episodes || episodeBreaks.episodes.length === 0 || totalPanels <= 0)
    return episodeBreaks

  const ranges = buildPageRanges(pageBreakPlan, totalPanels)
  if (ranges.length === 0) return episodeBreaks

  const eps = [...episodeBreaks.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const aligned: EpisodeBreakPlan['episodes'] = []

  let prevEnd = 0
  for (let i = 0; i < eps.length; i++) {
    const ep = eps[i]
    const startPage = pageOf(ep.startPanelIndex, ranges)
    const endPage = pageOf(ep.endPanelIndex, ranges)

    const snappedStart = firstIndexOfPage(startPage, ranges)
    const snappedEnd = lastIndexOfPage(endPage, ranges)

    const start = Math.max(1, i === 0 ? snappedStart : prevEnd + 1)
    const end = i === eps.length - 1 ? ranges[ranges.length - 1].end : snappedEnd

    if (end < start) {
      throw new Error(
        `Page alignment produced invalid range: episode ${ep.episodeNumber} start ${start} > end ${end}`,
      )
    }

    aligned.push({
      episodeNumber: aligned.length + 1,
      title: ep.title,
      description: ep.description,
      startPanelIndex: start,
      endPanelIndex: end,
    })

    prevEnd = end
  }

  // Ensure continuous coverage 1..totalPanels
  aligned[0].startPanelIndex = 1
  aligned[aligned.length - 1].endPanelIndex = totalPanels
  for (let i = 1; i < aligned.length; i++) {
    aligned[i].startPanelIndex = aligned[i - 1].endPanelIndex + 1
  }

  return { episodes: aligned }
}
