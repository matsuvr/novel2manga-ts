import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node-canvas to provide a minimal canvas + 2d context
const drawImageSpy = vi.fn()

vi.mock('canvas', () => {
  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '16px sans-serif',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    restore: vi.fn(),
    resetTransform: vi.fn(),
    save: vi.fn(),
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
    measureText: (t: string) => ({ width: t.length * 10 } as TextMetrics),
    fillText: vi.fn(),
    drawImage: drawImageSpy,
  }
  const canvas = {
    width: 1000,
    height: 1000,
    getContext: (id: string) => (id === '2d' ? (ctx as unknown as CanvasRenderingContext2D) : null),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
  }
  return {
    createCanvas: (w: number, h: number) => {
      canvas.width = w
      canvas.height = h
      return canvas as unknown as HTMLCanvasElement
    },
    Image: class {},
  }
})

import { CanvasRenderer } from '@/lib/canvas/canvas-renderer'
import type { MangaLayout } from '@/types/panel-layout'

describe('CanvasRenderer vertical dialogue scaling', () => {
  beforeEach(() => {
    drawImageSpy.mockClear()
  })

  it('scales oversized dialogue image to fit within panel bounds', () => {
    const renderer = new CanvasRenderer({ width: 1000, height: 1000 })

    // One page, one panel occupying 50% x 50%
    const layout: MangaLayout = {
      title: 't',
      author: 'a',
      created_at: new Date().toISOString(),
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 1,
              position: { x: 0, y: 0 },
              size: { width: 0.5, height: 0.5 },
              content: 'c',
              dialogues: [{ speaker: 's', text: 'こんにちは' }],
            },
          ],
        },
      ],
    }

    // Provide an oversized dialogue asset (800x1200) relative to panel
    renderer.setDialogueAssets({ '1:0': { image: { __img: true }, width: 800, height: 1200 } })

    renderer.renderMangaLayout(layout)

    expect(drawImageSpy).toHaveBeenCalled()
    const args = drawImageSpy.mock.calls[0]
    // args: [image, dx, dy, dWidth, dHeight]
    const dWidth = args[3] as number
    const dHeight = args[4] as number

    // Panel pixel bounds
    const panelW = 1000 * 0.5
    const panelH = 1000 * 0.5
    const maxAreaWidth = panelW * 0.45 // renderer logic
    const perBubbleMaxHeight = panelH * 0.7 // single dialogue

    expect(dWidth).toBeLessThanOrEqual(maxAreaWidth + 1e-6)
    expect(dHeight).toBeLessThanOrEqual(perBubbleMaxHeight + 1e-6)
    // Still positive
    expect(dWidth).toBeGreaterThan(0)
    expect(dHeight).toBeGreaterThan(0)
  })
})

