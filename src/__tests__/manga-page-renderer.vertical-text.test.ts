import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import type { MangaLayout } from '@/types/panel-layout'

// Mock vertical-text client
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalTextBatch: vi.fn(),
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

// Get the mocked module for accessing spies
const getCanvasRendererMock = async () => {
  const mod = await vi.importMock<any>('@/lib/canvas/canvas-renderer')
  return mod.CanvasRenderer
}

describe('MangaPageRenderer vertical text integration', () => {
  const OLD_ENV = { ...process.env }
  const MockLayout: MangaLayout = {
    title: 't',
    author: 'a',
    created_at: new Date().toISOString(),
    episodeNumber: 1,
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 'p1',
            position: { x: 0, y: 0 },
            size: { width: 1, height: 1 },
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

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...OLD_ENV }
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('test mode: prepares placeholder assets without calling API', async () => {
    process.env.NODE_ENV = 'test'
    const { renderVerticalTextBatch } = await import('@/services/vertical-text-client')
    const canvasRendererMock = await getCanvasRendererMock()

    const renderer = new MangaPageRenderer()
    // Create a mock canvas instance and assign it
    const mockInstance = await canvasRendererMock.create()
    renderer['canvasRenderer'] = mockInstance

    await renderer.renderToCanvas(MockLayout, 1)
    expect(mockInstance.setDialogueAssets).toHaveBeenCalledTimes(1)
    expect(renderVerticalTextBatch as any).not.toHaveBeenCalled()
    // assets contain two entries for two dialogues
    const callArg = mockInstance.setDialogueAssets.mock.calls[0][0] as Record<
      string,
      { width: number; height: number }
    >
    expect(Object.keys(callArg)).toEqual(['p1:0', 'p1:1'])
    expect(callArg['p1:0'].width).toBeGreaterThan(0)
    expect(callArg['p1:0'].height).toBeGreaterThan(0)
  })

  it('non-test mode: calls vertical text API and passes image sizes to CanvasRenderer', async () => {
    process.env.NODE_ENV = 'development'
    const { renderVerticalTextBatch } = await import('@/services/vertical-text-client')
    ;(renderVerticalTextBatch as any).mockResolvedValue([
      {
        meta: { image_base64: 'x', width: 120, height: 300 },
        pngBuffer: Buffer.from('iVBOR', 'base64'),
      },
      {
        meta: { image_base64: 'x', width: 120, height: 300 },
        pngBuffer: Buffer.from('iVBOR', 'base64'),
      },
    ])

    const canvasRendererMock = await getCanvasRendererMock()
    const renderer = new MangaPageRenderer()
    // Create a mock canvas instance and assign it
    const mockInstance = await canvasRendererMock.create()
    renderer['canvasRenderer'] = mockInstance

    await renderer.renderToCanvas(MockLayout, 1)
    expect(renderVerticalTextBatch as any).toHaveBeenCalledTimes(1)
    expect(mockInstance.setDialogueAssets).toHaveBeenCalledTimes(1)
    const arg = mockInstance.setDialogueAssets.mock.calls[0][0] as Record<
      string,
      { width: number; height: number }
    >
    expect(arg['p1:0'].width).toBe(120)
    expect(arg['p1:0'].height).toBe(300)
  })
})
