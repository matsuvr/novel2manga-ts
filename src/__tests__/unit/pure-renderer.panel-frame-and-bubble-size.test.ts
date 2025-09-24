import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { renderPagePure } from '@/lib/canvas/renderer/page-renderer-pure'
import type { MangaLayout } from '@/types/panel-layout'

function makeLayout(text: string): MangaLayout {
  return {
    title: 't',
    author: 'a',
    created_at: new Date().toISOString(),
    episodeNumber: 1,
    episodeTitle: 'ep',
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 1,
            position: { x: 0.05, y: 0.05 },
            size: { width: 0.9, height: 0.4 },
            content: '',
            dialogues: [
              { speaker: 'A', text, type: 'speech', emotion: 'normal' },
            ],
            sfx: [],
            sourceChunkIndex: 0,
            importance: 5,
          },
        ],
      },
    ],
  }
}

describe('pure renderer panel frame + bubble sizing', () => {
  it('draws panel frame stroke pixels (non-empty)', () => {
    const layout = makeLayout('テスト')
    const canvas = createCanvas(400, 600)
    const ctx = canvas.getContext('2d')
    renderPagePure(ctx as unknown as CanvasRenderingContext2D, { layout, pageNumber: 1, width: 400, height: 600 })
    // Check a pixel along expected frame (top-left corner)
    const img = ctx.getImageData(10, 10, 1, 1).data
    const alpha = img[3]
    expect(alpha).toBeGreaterThan(0)
  })
})
