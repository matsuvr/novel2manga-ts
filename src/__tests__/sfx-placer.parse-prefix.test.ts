import { describe, expect, it } from 'vitest'
import { SfxPlacer } from '@/lib/canvas/sfx-placer'

// Minimal panel stub
const panelBounds = { x: 0, y: 0, width: 800, height: 1200 }
const dummyPanel = {
  id: 'p1',
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  content: '',
} as unknown as import('@/types/panel-layout').Panel

describe('SfxPlacer - SFX prefix stripping', () => {
  const placer = new SfxPlacer()

  const cases = [
    'SFX: ざわざわ…',
    ' sfx: ゴゴゴ',
    'SFX： ガシャン', // full-width colon
    'ＳＦＸ： ドンッ', // full-width letters and colon
    '\uFEFFSFX: バン', // BOM before
  ]

  for (const raw of cases) {
    it(`removes prefix from "${raw}"`, () => {
      // Interpret possible \u escapes in test strings
      const input = raw.replace('\\uFEFF', '\uFEFF')
      const placements = placer.placeSfx([input], dummyPanel, panelBounds)
      expect(placements[0].text).not.toMatch(/^[sSｓＳ][fFｆＦ][xXｘＸ]\s*[:：]/)
      expect(placements[0].text).not.toContain('SFX:')
      expect(placements[0].text).not.toContain('SFX：')
      expect(placements[0].text).not.toContain('ＳＦＸ：')
    })
  }
})
