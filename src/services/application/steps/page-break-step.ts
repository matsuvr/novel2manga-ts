import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import { getAppConfigWithOverrides } from '@/config'
import { db } from '@/services/database'
import type { MangaLayout } from '@/types/panel-layout'
import type {
  PageBreakV2 as _PageBreakV2,
  EpisodeBreakPlan,
  NewMangaScript,
  PageBreakV2,
} from '@/types/script'
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
        // 重要: pageNumber の二重オフセットにより番号が飛ぶ問題を避けるため、
        // ここでは各エピソード内で付与された page_number をそのまま集約し、
        // 昇順で安定化して保存する（再番号付けは行わない）
        pages: allPages.sort((a, b) => a.page_number - b.page_number),
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

// ============ Bundling based on actual page counts (post page-break) ============
interface BundlingConfig {
  minPageCount: number
  enabled: boolean
}

function buildPanelToPageMap(pageBreakPlan: _PageBreakV2): number[] {
  // 1-based index alignment: index 0 is unused placeholder
  const map: number[] = [0]
  for (const p of pageBreakPlan.panels) {
    map.push(p.pageNumber)
  }
  return map
}

function countDistinctPagesInRange(panelToPage: number[], start: number, end: number): number {
  const seen = new Set<number>()
  for (let i = start; i <= end && i < panelToPage.length; i++) {
    const pg = panelToPage[i]
    if (typeof pg === 'number') seen.add(pg)
  }
  return seen.size
}

// Keep logic parallel to EpisodeBreakEstimationStep.bundleEpisodesByPageCount but using actual pages
// - Merge episodes with pages < minPageCount into the next episode
// - If the last episode still has pages < minPageCount, merge it into previous
// - Renumber sequentially
// - Preserve the receiver episode's title/description
// - No fallbacks; errors are surfaced
export function bundleEpisodesByActualPageCount(
  episodeBreaks: EpisodeBreakPlan,
  pageBreakPlan: _PageBreakV2,
  bundling: BundlingConfig,
  context: StepContext,
): EpisodeBreakPlan {
  const { jobId, logger } = context
  if (!bundling.enabled) {
    logger.info('Page-based episode bundling disabled by configuration', { jobId })
    return episodeBreaks
  }

  if (!episodeBreaks.episodes || episodeBreaks.episodes.length <= 1) {
    logger.info('No page-based bundling needed (<=1 episode)', { jobId })
    return episodeBreaks
  }

  const episodes = [...episodeBreaks.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const toRemove = new Set<number>()
  const panelToPage = buildPanelToPageMap(pageBreakPlan)

  logger.info('Starting page-based episode bundling', {
    jobId,
    originalEpisodes: episodes.length,
    minPageCount: bundling.minPageCount,
  })

  // First pass: left-to-right merge into next until threshold is satisfied
  for (let i = 0; i < episodes.length - 1; i++) {
    if (toRemove.has(i)) continue
    const cur = episodes[i]
    const curPages = countDistinctPagesInRange(panelToPage, cur.startPanelIndex, cur.endPanelIndex)
    if (curPages < bundling.minPageCount) {
      const j = i + 1
      if (j < episodes.length) {
        const nxt = episodes[j]
        // Merge cur -> nxt (nxt becomes receiver)
        episodes[j] = {
          ...nxt,
          startPanelIndex: cur.startPanelIndex,
          title: cur.title || nxt.title,
          description: cur.description || nxt.description,
        }
        toRemove.add(i)

        const newPages = countDistinctPagesInRange(
          panelToPage,
          episodes[j].startPanelIndex,
          episodes[j].endPanelIndex,
        )
        logger.info('Merged short episode into next (page-based)', {
          jobId,
          mergedEpisode: cur.episodeNumber,
          intoEpisode: nxt.episodeNumber,
          curPages,
          nextPagesBefore: countDistinctPagesInRange(
            panelToPage,
            nxt.startPanelIndex,
            nxt.endPanelIndex,
          ),
          newPages,
        })
      }
    }
  }

  // Handle last episode: if still short, merge into previous
  let last = episodes.length - 1
  while (last >= 0 && toRemove.has(last)) last--
  if (last >= 0) {
    const lastEp = episodes[last]
    const lastPages = countDistinctPagesInRange(
      panelToPage,
      lastEp.startPanelIndex,
      lastEp.endPanelIndex,
    )
    if (lastPages < bundling.minPageCount) {
      let prev = last - 1
      while (prev >= 0 && toRemove.has(prev)) prev--
      if (prev >= 0) {
        const prevEp = episodes[prev]
        episodes[prev] = {
          ...prevEp,
          endPanelIndex: lastEp.endPanelIndex,
          title: prevEp.title || lastEp.title,
          description: prevEp.description || lastEp.description,
        }
        toRemove.add(last)
        const newPages = countDistinctPagesInRange(
          panelToPage,
          episodes[prev].startPanelIndex,
          episodes[prev].endPanelIndex,
        )
        logger.info('Merged last short episode into previous (page-based)', {
          jobId,
          mergedEpisode: lastEp.episodeNumber,
          intoPreviousEpisode: prevEp.episodeNumber,
          lastPages,
          prevPagesBefore: countDistinctPagesInRange(
            panelToPage,
            prevEp.startPanelIndex,
            prevEp.endPanelIndex,
          ),
          newPages,
        })
      }
    }
  }

  const finalEpisodes = episodes
    .filter((_, idx) => !toRemove.has(idx))
    .map((e, idx) => ({ ...e, episodeNumber: idx + 1 }))

  logger.info('Page-based episode bundling completed', {
    jobId,
    originalEpisodeCount: episodes.length,
    finalEpisodeCount: finalEpisodes.length,
    removedCount: toRemove.size,
    finalEpisodes: finalEpisodes.map((e) => ({
      no: e.episodeNumber,
      panelRange: `${e.startPanelIndex}-${e.endPanelIndex}`,
      pages: countDistinctPagesInRange(panelToPage, e.startPanelIndex, e.endPanelIndex),
    })),
  })

  return { episodes: finalEpisodes }
}
