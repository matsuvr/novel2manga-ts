import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import type { MangaLayout } from '@/types/panel-layout'
import { appConfig } from '@/config/app.config'

// Mock vertical-text client (spy on arguments)
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalText: vi.fn().mockResolvedValue({
    meta: { image_base64: 'x', width: 120, height: 300 },
    pngBuffer: Buffer.from('iVBOR', 'base64'),
  }),
}))

// Spy-able CanvasRenderer mock that exposes setDialogueAssets and static createImageFromBuffer
vi.mock('@/lib/canvas/canvas-renderer', async () => {
  const setDialogueAssetsSpy = vi.fn()
  const renderMangaLayoutSpy = vi.fn()

  const mockCanvasInstance = {
    canvas: { width: 595, height: 842 },
    renderMangaLayout: renderMangaLayoutSpy,
    setDialogueAssets: setDialogueAssetsSpy,
    toBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/png' })),
    cleanup: vi.fn(),
  }

  return {
    CanvasRenderer: {
      create: vi.fn().mockResolvedValue(mockCanvasInstance),
      createImageFromBuffer: vi.fn().mockReturnValue({
        image: { __img: true },
        width: 120,
        height: 300,
      }),
    },
  }
})

describe('MangaPageRenderer: maxCharsPerLine scaling by panel height', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'development' }
    vi.clearAllMocks()
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  function makeLayout(height: number): MangaLayout {
    return {
      title: 't',
      author: 'a',
      created_at: new Date().toISOString(),
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 'p',
              position: { x: 0, y: 0 },
              size: { width: 1, height },
              content: 'c',
              dialogues: [
                { speaker: 's', text: 'こんにちは', emotion: 'normal' },
                { speaker: 't', text: 'やあ', emotion: 'shout' },
              ],
            },
          ],
        },
      ],
    }
  }

  it('height <= 0.2 uses 6 chars per line', async () => {
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    const renderer = new MangaPageRenderer()
    const mockInstance = await (canvasMod as any).CanvasRenderer.create()
    ;(renderer as any)['canvasRenderer'] = mockInstance

    const layout = makeLayout(0.2)
    await renderer.renderToCanvas(layout, 1)

    expect((renderVerticalText as any).mock.calls.length).toBe(2)
    const firstArg = (renderVerticalText as any).mock.calls[0][0]
    expect(firstArg.maxCharsPerLine).toBe(6)
  })

  it('height <= 0.3 uses 8 chars per line', async () => {
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    const renderer = new MangaPageRenderer()
    const mockInstance = await (canvasMod as any).CanvasRenderer.create()
    ;(renderer as any)['canvasRenderer'] = mockInstance

    const layout = makeLayout(0.25)
    await renderer.renderToCanvas(layout, 1)

    expect((renderVerticalText as any).mock.calls.length).toBe(2)
    const firstArg = (renderVerticalText as any).mock.calls[0][0]
    expect(firstArg.maxCharsPerLine).toBe(8)
  })

  it('height > 0.3 uses default from config', async () => {
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    const renderer = new MangaPageRenderer()
    const mockInstance = await (canvasMod as any).CanvasRenderer.create()
    ;(renderer as any)['canvasRenderer'] = mockInstance

    const layout = makeLayout(0.4)
    await renderer.renderToCanvas(layout, 1)

    expect((renderVerticalText as any).mock.calls.length).toBe(2)
    const firstArg = (renderVerticalText as any).mock.calls[0][0]
    expect(firstArg.maxCharsPerLine).toBe(appConfig.rendering.verticalText.defaults.maxCharsPerLine)
  })
})
