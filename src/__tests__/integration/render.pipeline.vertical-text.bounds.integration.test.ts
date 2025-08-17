import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfig } from '@/config/app.config'

// Spy for drawImage to assert scaled dimensions
const drawImageSpy = vi.fn()

// Mock the 'canvas' module BEFORE importing renderer pipeline
vi.mock('canvas', () => {
  const ctx = {
    fillStyle: '#fff',
    strokeStyle: '#000',
    lineWidth: 2,
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
    measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics,
    fillText: vi.fn(),
    drawImage: drawImageSpy,
  }
  const canvas = {
    width: appConfig.rendering.defaultPageSize.width,
    height: appConfig.rendering.defaultPageSize.height,
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

// Mock vertical-text client; will be reconfigured per test
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalText: vi.fn(),
}))

describe.skip('integration: vertical text drawImage bounds and concurrency', () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    drawImageSpy.mockClear()
    process.env = { ...OLD_ENV, NODE_ENV: 'development' }
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('drawImage dimensions fit within panel bounds', async () => {
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    ;(renderVerticalText as any).mockResolvedValue({
      meta: { image_base64: 'x', width: 800, height: 1200 },
      pngBuffer: Buffer.from('iVBOR', 'base64'),
    })

    // Oversized image; stub Image creation to return same size
    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    // @ts-expect-error test shim
    canvasMod.CanvasRenderer.createImageFromBuffer = vi.fn().mockReturnValue({
      image: { __img: true },
      width: 800,
      height: 1200,
    })

    const { renderBatchFromYaml } = await import('@/services/application/render')

    const YAML = `
title: test
created_at: "2025-08-16T00:00:00.000Z"
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: 1
        position: { x: 0.0, y: 0.0 }
        size: { width: 0.5, height: 0.5 }
        content: "scene"
        dialogues:
          - { speaker: "A", text: "こんにちは", emotion: "normal" }
`

    const ports = {
      render: {
        putPageRender: async (_j: string, _e: number, _p: number, _b: Buffer) => 'mem://r.png',
        putPageThumbnail: async (_j: string, _e: number, _p: number, _b: Buffer) => 'mem://t.jpg',
      },
      layout: { getEpisodeLayout: async () => YAML },
    } as any

    const res = await renderBatchFromYaml('job', 1, YAML, [1], { concurrency: 1 }, ports)
    expect(res.failedPages).toBe(0)
    expect(drawImageSpy).toHaveBeenCalled()

    const args = drawImageSpy.mock.calls[0]
    const dWidth = args[3] as number
    const dHeight = args[4] as number
    const pageW = appConfig.rendering.defaultPageSize.width
    const pageH = appConfig.rendering.defaultPageSize.height
    const panelW = pageW * 0.5
    const panelH = pageH * 0.5
    const maxAreaWidth = panelW * 0.45
    const perBubbleMaxHeight = panelH * 0.7

    expect(dWidth).toBeGreaterThan(0)
    expect(dHeight).toBeGreaterThan(0)
    expect(dWidth).toBeLessThanOrEqual(maxAreaWidth + 1e-6)
    expect(dHeight).toBeLessThanOrEqual(perBubbleMaxHeight + 1e-6)
  })

  it('does not exceed configured vertical-text concurrency (sequential in current impl)', async () => {
    process.env.APP_RENDER_VERTICAL_TEXT_MAX_CONCURRENT = '1'
    let inFlight = 0
    let maxInFlight = 0
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    ;(renderVerticalText as any).mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 10))
      inFlight--
      return {
        meta: { image_base64: 'x', width: 120, height: 300 },
        pngBuffer: Buffer.from('iVBOR', 'base64'),
      }
    })

    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    // @ts-expect-error test shim
    canvasMod.CanvasRenderer.createImageFromBuffer = vi.fn().mockReturnValue({
      image: { __img: true },
      width: 120,
      height: 300,
    })

    const { renderBatchFromYaml } = await import('@/services/application/render')

    const YAML = `
title: test
created_at: "2025-08-16T00:00:00.000Z"
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: 1
        position: { x: 0.0, y: 0.0 }
        size: { width: 1.0, height: 1.0 }
        content: "scene"
        dialogues:
          - { speaker: "A", text: "こんにちは", emotion: "normal" }
          - { speaker: "B", text: "やあ", emotion: "normal" }
          - { speaker: "C", text: "もしもし", emotion: "normal" }
`

    const ports = {
      render: {
        putPageRender: async () => 'mem://r.png',
        putPageThumbnail: async () => 'mem://t.jpg',
      },
      layout: { getEpisodeLayout: async () => YAML },
    } as any

    const res = await renderBatchFromYaml('job', 1, YAML, [1], { concurrency: 1 }, ports)
    expect(res.failedPages).toBe(0)
    // Current implementation is sequential, so maxInFlight should be 1
    expect(maxInFlight).toBeLessThanOrEqual(1)
  })
})
