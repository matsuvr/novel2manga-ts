import type { StepContext } from '@/services/application/steps/base-step'
import type { EpisodeBreakPlan, PageBreakV2 } from '@/types/script'

// Shared page range structure
interface PageRange { page: number; start: number; end: number }

function buildPageRanges(plan: PageBreakV2, totalPanels: number): PageRange[] {
  if (!plan.panels || plan.panels.length === 0 || totalPanels <= 0) return []
  const ranges: PageRange[] = []
  let currentPage = plan.panels[0].pageNumber
  let startIdx = 1
  for (let i = 1; i <= totalPanels; i++) {
    const p = plan.panels[i - 1]
    if (!p) break
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
  for (const r of ranges) if (index >= r.start && index <= r.end) return r.page
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

/**
 * Align episode panel ranges so they do not cross page boundaries (continuous coverage).
 */
export function alignEpisodesToPages(
  episodeBreaks: EpisodeBreakPlan,
  pageBreakPlan: PageBreakV2,
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
  aligned[0].startPanelIndex = 1
  aligned[aligned.length - 1].endPanelIndex = totalPanels
  for (let i = 1; i < aligned.length; i++) {
    aligned[i].startPanelIndex = aligned[i - 1].endPanelIndex + 1
  }
  return { episodes: aligned }
}

// === Bundling helpers ===
interface BundlingConfig { minPageCount: number; enabled: boolean }

function buildPanelToPageMap(pageBreakPlan: PageBreakV2): number[] {
  const map: number[] = [0]
  for (const p of pageBreakPlan.panels || []) map.push(p.pageNumber)
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

export function bundleEpisodesByActualPageCount(
  episodeBreaks: EpisodeBreakPlan,
  pageBreakPlan: PageBreakV2,
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
  for (let i = 0; i < episodes.length - 1; i++) {
    if (toRemove.has(i)) continue
    const cur = episodes[i]
    const curPages = countDistinctPagesInRange(panelToPage, cur.startPanelIndex, cur.endPanelIndex)
    if (curPages < bundling.minPageCount) {
      const j = i + 1
      if (j < episodes.length) {
        const nxt = episodes[j]
        episodes[j] = {
          ...nxt,
            startPanelIndex: cur.startPanelIndex,
            title: cur.title || nxt.title,
            description: cur.description || nxt.description,
        }
        toRemove.add(i)
        logger.info('Merged short episode into next (page-based)', {
          jobId,
          mergedEpisode: cur.episodeNumber,
          intoEpisode: nxt.episodeNumber,
          curPages,
        })
      }
    }
  }
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
        logger.info('Merged last short episode into previous (page-based)', {
          jobId,
          mergedEpisode: lastEp.episodeNumber,
          intoPreviousEpisode: prevEp.episodeNumber,
          lastPages,
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
  })
  return { episodes: finalEpisodes }
}
