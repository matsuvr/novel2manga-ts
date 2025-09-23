import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bundleEpisodesByActualPageCount } from '@/services/application/layout-pipeline/helpers'
import type { StepContext } from '@/services/application/steps/base-step'
import type { EpisodeBreakPlan, PageBreakV2 } from '@/types/script'

describe('Page-based bundling helper (legacy compatibility scenario)', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withContext: () => logger,
  }
  const context: StepContext = { jobId: 'job-bundle-pages', logger, novelId: 'novel-x' }

  beforeEach(() => vi.clearAllMocks())

  it('merges short episodes using actual page counts and merges last into previous', () => {
    // Build a simple pageBreakPlan where each panel is its own page (1 panel = 1 page)
    // Total pages: 70
    const panels: PageBreakV2['panels'] = []
    for (let i = 1; i <= 70; i++) {
      panels.push({ pageNumber: i, panelIndex: i, content: '' })
    }
    const pageBreakPlan: PageBreakV2 = { panels }

    // Episodes by page counts (equal to panel count here):
    // [9, 12, 9, 9, 18, 13] => should bundle to [21, 49]
    const episodeBreaks: EpisodeBreakPlan = {
      episodes: [
        { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 9, title: 'E1' },
        { episodeNumber: 2, startPanelIndex: 10, endPanelIndex: 21, title: 'E2' },
        { episodeNumber: 3, startPanelIndex: 22, endPanelIndex: 30, title: 'E3' },
        { episodeNumber: 4, startPanelIndex: 31, endPanelIndex: 39, title: 'E4' },
        { episodeNumber: 5, startPanelIndex: 40, endPanelIndex: 57, title: 'E5' },
        { episodeNumber: 6, startPanelIndex: 58, endPanelIndex: 70, title: 'E6' },
      ],
    }

    const bundled = bundleEpisodesByActualPageCount(
      episodeBreaks,
      pageBreakPlan,
      { minPageCount: 20, enabled: true },
      context,
    )

    // Expect two episodes after bundling
    expect(bundled.episodes).toHaveLength(2)

    const [e1, e2] = bundled.episodes
    // E1: merged (E1+E2) => 1..21 (21 pages)
    expect(e1.startPanelIndex).toBe(1)
    expect(e1.endPanelIndex).toBe(21)
    expect(e1.title).toBe('E1') // first episode title preserved

    // E2: merged (E3+E4+E5+E6) => 22..70 (49 pages)
    expect(e2.startPanelIndex).toBe(22)
    expect(e2.endPanelIndex).toBe(70)
    expect(e2.title).toBe('E3') // first episode title preserved across merges
  })
})
