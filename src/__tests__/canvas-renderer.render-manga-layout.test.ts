/// <reference types="vitest" />
import { beforeEach, describe, expect, it, vi } from 'vitest'

const strokeRectSpy = vi.fn()

vi.mock('@napi-rs/canvas', () => {
  const ctx = {
    fillStyle: '#ffffff',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '16px sans-serif',
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: strokeRectSpy,
    drawImage: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 100 }),
    ellipse: vi.fn(),
  }
  const canvas = {
    width: 1200,
    height: 1684,
    getContext: (id: string) => (id === '2d' ? (ctx as unknown as CanvasRenderingContext2D) : null),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('iVBORw0KGgo=', 'base64')),
  }
  return {
    createCanvas: () => canvas as unknown as HTMLCanvasElement,
    GlobalFonts: {
      register: vi.fn(),
    },
    loadImage: vi.fn().mockResolvedValue({ width: 100, height: 200 }),
  }
})

describe('CanvasRenderer.renderMangaLayout', () => {
  beforeEach(() => {
    strokeRectSpy.mockClear()
  })

  it('draws all panels from the provided page layout', async () => {
    const { CanvasRenderer } = await import('@/lib/canvas/canvas-renderer')
    const renderer = await CanvasRenderer.create({ width: 1200, height: 1684 })

    renderer.setDialogueAssets({
      '1:0': { image: {} as CanvasImageSource, width: 100, height: 200 },
      '3:0': { image: {} as CanvasImageSource, width: 100, height: 200 },
    })

    const layout = {
      title: 'Test',
      author: 'Tester',
      created_at: new Date().toISOString(),
      episodeNumber: 1,
      episodeTitle: 'Episode 1',
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 1,
              position: { x: 0, y: 0.08 },
              size: { width: 1, height: 0.28 },
              content: 'Panel 1 content',
              dialogues: [
                {
                  speaker: 'Narrator',
                  text: 'Narration',
                  type: 'narration',
                },
              ],
              sfx: ['ざわ…'],
            },
            {
              id: 2,
              position: { x: 0.5, y: 0.38 },
              size: { width: 0.5, height: 0.25 },
              content: 'Panel 2 content',
              dialogues: [],
              sfx: ['タタタッ'],
            },
            {
              id: 3,
              position: { x: 0, y: 0.38 },
              size: { width: 0.5, height: 0.25 },
              content: 'Panel 3 content',
              dialogues: [
                {
                  speaker: '駅吏',
                  text: 'セリフ',
                  type: 'speech',
                },
              ],
              sfx: [],
            },
          ],
        },
      ],
    }

    renderer.renderMangaLayout(layout as any)

    // Expect one call for page border plus one per panel
    expect(strokeRectSpy).toHaveBeenCalledTimes(4)
  })
})
