import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { CanvasRenderer } from '@/lib/canvas/canvas-renderer'
import type { MangaLayout } from '@/types/panel-layout'

// Helper to build a simple layout with dialogues (pre-rendered assets mocked)
function buildLayout(dialogueWidths: number[], dialogueHeights: number[]): MangaLayout {
  const panels = [
    {
      id: 1,
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
      content: '',
      dialogues: dialogueWidths.map((_, i) => ({
        speaker: 'A',
        text: `テキスト${i}`,
        emotion: 'normal',
        context: '',
        type: 'speech' as const,
      })),
      sfx: [],
      sourceChunkIndex: 0,
      importance: 5,
    },
  ]
  return {
    title: 't',
    author: 'a',
    created_at: new Date().toISOString(),
    episodeNumber: 1,
    episodeTitle: 'e1',
    pages: [ { page_number: 1, panels } ],
  }
}

describe('CanvasRenderer dialogue bubble layout (RTL ordering)', () => {
  it('places multiple dialogue bubbles from right to left without overlap', async () => {
    const renderer = await CanvasRenderer.create({ width: 800, height: 1200 })
    const layout = buildLayout([80, 80, 80], [160, 160, 160])

    // Mock dialogue assets (key convention: panelId:dialogueIndex)
    const assets: Record<string, any> = {}
    for (let i = 0; i < 3; i++) {
      const c = createCanvas(80, 160) as unknown as CanvasImageSource
      assets[`1:${i}`] = { image: c, width: 80, height: 160 }
    }
    renderer.setDialogueAssets(assets)

    renderer.renderMangaLayout(layout)

    // Access registered areas from internal layout coordinator (public getter provided)
    const areas = renderer.getLayoutCoordinator().getOccupiedAreas()
    // Filter only dialogues
    const dialogueAreas = areas.filter(a => a.type === 'dialogue')
    expect(dialogueAreas.length).toBe(3)

    // Ensure x positions are strictly decreasing (right -> left ordering)
    const xs = dialogueAreas.map(a => a.x)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeLessThan(xs[i - 1])
    }

    // Naive overlap check: bounding boxes should not intersect
    for (let i = 0; i < dialogueAreas.length; i++) {
      for (let j = i + 1; j < dialogueAreas.length; j++) {
        const A = dialogueAreas[i]
        const B = dialogueAreas[j]
        const noOverlap = A.x + A.width <= B.x || B.x + B.width <= A.x || A.y + A.height <= B.y || B.y + B.height <= A.y
        expect(noOverlap).toBe(true)
      }
    }
  })
})
