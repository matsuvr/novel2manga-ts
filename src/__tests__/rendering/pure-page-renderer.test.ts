import { describe, expect, it } from 'vitest'
import { renderPagePure } from '@/lib/canvas/renderer/page-renderer-pure'
import { createDialogueSegmentsPipeline } from '@/services/application/rendering/assets/dialogue-segments-pipeline'
import type { MangaLayout } from '@/types/panel-layout'

// Structural minimal subset for tests (NOT full CanvasRenderingContext2D)
interface MockCtx {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  font: string
  strokeRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  rect(x: number, y: number, w: number, h: number): void
  ellipse(x: number, y: number, rx: number, ry: number): void
  fill(): void
  stroke(): void
  measureText(text: string): TextMetrics
  fillText(text: string, x: number, y: number): void
}

class Mock2DContext implements MockCtx {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000'
  font = ''
  calls: string[] = []
  strokeRect(x: number, y: number, w: number, h: number) { this.calls.push(`strokeRect:${x},${y},${w},${h}`) }
  fillRect(x: number, y: number, w: number, h: number) { this.calls.push(`fillRect:${x},${y},${w},${h}`) }
  beginPath() { this.calls.push('beginPath') }
  rect(x: number, y: number, w: number, h: number) { this.calls.push(`rect:${x},${y},${w},${h}`) }
  ellipse(x: number, y: number, rx: number, ry: number) { this.calls.push(`ellipse:${x},${y},${rx},${ry}`) }
  fill() { this.calls.push('fill') }
  stroke() { this.calls.push('stroke') }
  measureText(text: string): TextMetrics { return { width: text.length * 10 } as TextMetrics }
  fillText(text: string, x: number, y: number) { this.calls.push(`fillText:${text}@${x},${y}`) }
}

function makeLayout(dialogue: string): MangaLayout {
  return {
    pages: [
      {
        page_number: 1,
        panels: [
          {
            position: { x: 0, y: 0 },
            size: { width: 1, height: 1 },
            dialogues: [{ text: dialogue, type: 'speech' }],
            sfx: ['ドン'] as any,
          },
        ],
      },
    ],
  } as MangaLayout
}

describe('renderPagePure', () => {
  it('draws panel frame, bubble and sfx', () => {
    const ctx = new Mock2DContext()
    const layout = makeLayout('こんにちは世界')
  renderPagePure(ctx as unknown as CanvasRenderingContext2D, { layout, pageNumber: 1, width: 400, height: 600 })
    // Basic expectations
    expect(ctx.calls.some(c => c.startsWith('strokeRect'))).toBe(true)
    expect(ctx.calls.find(c => c.startsWith('fillText:こんにちは世界'))).toBeTruthy()
    expect(ctx.calls.find(c => c.includes('fillText:ドン'))).toBeTruthy()
  })

  it('applies segmentation pipeline to split lines', () => {
    const ctx = new Mock2DContext()
    const long = '今日は良い天気ですね今日は良い天気ですね'
    const layout = makeLayout(long)
    const pipeline = createDialogueSegmentsPipeline(5)
    pipeline.prepare([long])
  renderPagePure(ctx as unknown as CanvasRenderingContext2D, { layout, pageNumber: 1, width: 200, height: 400, segmentsPipeline: pipeline })
    // Because measureText = len*10 and width=200 with padding, long text should wrap
    const dialogueCalls = ctx.calls.filter(c => c.startsWith('fillText:'))
    expect(dialogueCalls.length).toBeGreaterThan(1)
  })
})
