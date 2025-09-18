import { describe, expect, it } from 'vitest'
import type { Panel } from '@/types/panel-layout'
import { normalizePanelsVerticalCoverage } from '@/utils/layout-template-applier'

function panel(id: number, y: number, h: number, x = 0, w = 1): Panel {
  return {
    id,
    position: { x, y },
    size: { width: w, height: h },
    content: '',
    dialogues: [],
    sfx: [],
    sourceChunkIndex: 0,
    importance: 5,
  }
}

describe('normalizePanelsVerticalCoverage', () => {
  it('expands panels whose combined vertical span is < 1 to fill full height', () => {
    // Original sample-like three panels: y: 0.08 (0.28h), 0.38 (0.25h), 0.38 (0.25h) => span 0.08..0.63
    const original: Panel[] = [
      panel(1, 0.08, 0.28),
      panel(2, 0.38, 0.25, 0.5, 0.5),
      panel(3, 0.38, 0.25, 0, 0.5),
    ]
    const normalized = normalizePanelsVerticalCoverage(original)
    const minY = Math.min(...normalized.map((p) => p.position.y))
    const maxY = Math.max(...normalized.map((p) => p.position.y + p.size.height))
    expect(minY).toBeCloseTo(0, 5)
    expect(maxY).toBeCloseTo(1, 5)
  })

  it('keeps panels unchanged when already filling full height', () => {
    const full: Panel[] = [panel(1, 0, 1)]
    const normalized = normalizePanelsVerticalCoverage(full)
    expect(normalized[0].position.y).toBe(0)
    expect(normalized[0].size.height).toBe(1)
  })
})
