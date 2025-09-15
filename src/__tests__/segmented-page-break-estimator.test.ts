import { describe, expect, it, vi } from 'vitest'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import type { NewMangaScript } from '@/types/script'

describe('segmented page break estimator', () => {
  it('carries importance across segments', async () => {
    const script: NewMangaScript = {
      style_tone: '',
      style_art: '',
      style_sfx: '',
      characters: [],
      locations: [],
      props: [],
      continuity_checks: [],
      panels: [
        { no: 1, importance: 3 },
        { no: 2, importance: 2 },
        { no: 3, importance: 1 },
        { no: 4, importance: 4 },
      ],
    }

    vi.stubEnv('NODE_ENV', 'development')

    const result = await estimatePageBreaksSegmented(script, {
      forceSegmentation: true,
      segmentationConfig: {
        maxPanelsPerSegment: 2,
        minPanelsForSegmentation: 2,
        contextOverlapPanels: 0,
      },
    })

    const pages = result.pageBreaks.panels.map((p) => p.pageNumber)
    expect(pages).toEqual([1, 1, 1, 2])
  })
})
