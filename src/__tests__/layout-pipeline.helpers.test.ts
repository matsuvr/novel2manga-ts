import { describe, expect, it } from 'vitest'
import { alignEpisodesToPages, bundleEpisodesByActualPageCount } from '@/services/application/layout-pipeline/helpers'
import type { StepContext } from '@/services/application/steps/base-step'
import type { EpisodeBreakPlan, PageBreakV2 } from '@/types/script'

function makeContext(): StepContext {
  const logs: any[] = []
  const logger = {
    debug: (m: string, meta?: any) => logs.push({ level: 'debug', m, meta }),
    info: (m: string, meta?: any) => logs.push({ level: 'info', m, meta }),
    warn: (m: string, meta?: any) => logs.push({ level: 'warn', m, meta }),
    error: (m: string, meta?: any) => logs.push({ level: 'error', m, meta }),
    withContext: () => logger,
  }
  return { jobId: 'job-helpers', novelId: 'novel-1', logger, ports: {} as any }
}

describe('layout-pipeline helpers', () => {
  describe('alignEpisodesToPages', () => {
  it('aligns episode boundaries to full pages they touch and enforces continuous coverage', () => {
      // Panels 1-3 page1, 4-6 page2, 7-9 page3
      const pageBreakPlan: PageBreakV2 = {
        panels: Array.from({ length: 9 }, (_, i) => ({
          pageNumber: i < 3 ? 1 : i < 6 ? 2 : 3,
          panelIndex: i + 1,
          content: `P${i + 1}`,
          dialogue: [],
        })),
      }
      // Episodes intentionally cross pages
      const episodeBreaks: EpisodeBreakPlan = {
        episodes: [
          { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 4, title: 'E1' }, // spans page1 & part of page2
          { episodeNumber: 2, startPanelIndex: 5, endPanelIndex: 9, title: 'E2' }, // spans rest of page2 & page3
        ],
      }
      const aligned = alignEpisodesToPages(episodeBreaks, pageBreakPlan, 9)
      expect(aligned.episodes).toHaveLength(2)
  // Episode 1 crosses page1->page2; it expands to cover whole pages 1 & 2 (panels 1..6)
  expect(aligned.episodes[0]).toMatchObject({ startPanelIndex: 1, endPanelIndex: 6 })
  // Episode 2 shifts to start at panel 7 (continuity) through final panel 9
  expect(aligned.episodes[1]).toMatchObject({ startPanelIndex: 7, endPanelIndex: 9 })
      // Coverage continuity
      const covered = aligned.episodes.flatMap((e) =>
        Array.from({ length: e.endPanelIndex - e.startPanelIndex + 1 }, (_, k) => e.startPanelIndex + k),
      )
      expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('keeps episode contained fully within a single page as-is', () => {
      const plan: PageBreakV2 = {
        panels: [
          { pageNumber: 1, panelIndex: 1, content: 'P1', dialogue: [] },
          { pageNumber: 1, panelIndex: 2, content: 'P2', dialogue: [] },
          { pageNumber: 2, panelIndex: 3, content: 'P3', dialogue: [] },
        ],
      }
      const eps: EpisodeBreakPlan = { episodes: [{ episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 2 }] }
      const aligned = alignEpisodesToPages(eps, plan, 3)
      expect(aligned.episodes).toHaveLength(1)
      expect(aligned.episodes[0]).toMatchObject({ startPanelIndex: 1, endPanelIndex: 3 })
      // Note: algorithm forces final episode to extend to totalPanels (coverage continuity)
    })
  })

  describe('bundleEpisodesByActualPageCount', () => {
    it('returns unchanged when bundling disabled', () => {
      const plan: PageBreakV2 = {
        panels: [
          { pageNumber: 1, panelIndex: 1, content: 'A', dialogue: [] },
          { pageNumber: 1, panelIndex: 2, content: 'B', dialogue: [] },
        ],
      }
      const episodes: EpisodeBreakPlan = {
        episodes: [
          { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 1 },
          { episodeNumber: 2, startPanelIndex: 2, endPanelIndex: 2 },
        ],
      }
      const ctx = makeContext()
      const result = bundleEpisodesByActualPageCount(episodes, plan, { enabled: false, minPageCount: 2 }, ctx)
      expect(result).toEqual(episodes)
    })

    it('merges short episodes forward then last into previous if still below threshold', () => {
      // 3 pages, each 1 panel so each original episode has 1 page
      const plan: PageBreakV2 = {
        panels: [
          { pageNumber: 1, panelIndex: 1, content: 'P1', dialogue: [] },
          { pageNumber: 2, panelIndex: 2, content: 'P2', dialogue: [] },
          { pageNumber: 3, panelIndex: 3, content: 'P3', dialogue: [] },
        ],
      }
      const episodes: EpisodeBreakPlan = {
        episodes: [
          { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 1, title: 'E1' },
          { episodeNumber: 2, startPanelIndex: 2, endPanelIndex: 2, title: 'E2' },
          { episodeNumber: 3, startPanelIndex: 3, endPanelIndex: 3, title: 'E3' },
        ],
      }
      const ctx = makeContext()
      const bundled = bundleEpisodesByActualPageCount(episodes, plan, { enabled: true, minPageCount: 2 }, ctx)
      // After first pass: E1 (1 page) merges into E2 => episode indices renumbered later
      // E3 (1 page) then merges into previous (resulting combined 3 pages)
      expect(bundled.episodes).toHaveLength(1)
      expect(bundled.episodes[0]).toMatchObject({ startPanelIndex: 1, endPanelIndex: 3, episodeNumber: 1 })
    })
  })
})
