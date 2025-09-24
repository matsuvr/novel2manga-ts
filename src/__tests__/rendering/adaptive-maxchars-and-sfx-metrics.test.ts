import { describe, expect, it } from 'vitest'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { SfxPlacer } from '@/lib/canvas/sfx-placer'

describe('adaptive maxCharsPerLine & SFX metrics', () => {
  it('computes decreasing maxCharsPerLine for smaller panels', async () => {
    const r = await MangaPageRenderer.create()
    // @ts-expect-private-access: test accessing private via cast for deterministic validation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyR = r as any
    const fn = anyR.computeMaxCharsPerLine.bind(anyR)
    const large = fn(0.5)
    const medium = fn(0.3)
    const small = fn(0.15)
    const tiny = fn(0.1)
    expect(large).toBeGreaterThanOrEqual(medium)
    expect(medium).toBeGreaterThanOrEqual(small)
    expect(small).toBeGreaterThan(tiny)
    // tiny should hit minCharsPerLine (config default 4)
    expect(tiny).toBeGreaterThanOrEqual(4)
  })

  it('SfxPlacer provides fallback grid metrics when initial candidates fail', () => {
    const placer = new SfxPlacer()
    const panelBounds = { x: 0, y: 0, width: 200, height: 120 }
    // Occupy most of area to force fallback
    const occupied = [
      { x: 0, y: 0, width: 200, height: 60 },
      { x: 0, y: 60, width: 200, height: 60 },
    ]
    const placements = placer.placeSfx(['SFX: ドーン'], { dialogues: [] } as any, panelBounds, occupied)
    expect(placements.length).toBe(1)
    const m = placer.getLastMetrics()
    expect(m.fallbackGridUsed).toBe(1)
    expect(m.gridCellsEvaluated).toBeGreaterThan(0)
  })
})
