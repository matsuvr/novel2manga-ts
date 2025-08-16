import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoragePorts } from '@/infrastructure/storage/ports'

// Mock for createImageFromBuffer will be set in test

import { renderBatchFromYaml } from '@/services/application/render'

// Minimal YAML with one page, one panel, two dialogues
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
          - { speaker: "B", text: "やあ", emotion: "shout" }
`

// Mock storage ports to capture renders (no disk)
function makeMemoryRenderPorts() {
  const renders: Record<string, Buffer> = {}
  const thumbs: Record<string, Buffer> = {}
  return {
    render: {
      async putPageRender(jobId: string, episodeNumber: number, pageNumber: number, data: Buffer) {
        const k = `${jobId}/${episodeNumber}/${pageNumber}`
        renders[k] = data
        return `mem://renders/${k}.png`
      },
      async putPageThumbnail(jobId: string, episodeNumber: number, pageNumber: number, data: Buffer) {
        const k = `${jobId}/${episodeNumber}/${pageNumber}`
        thumbs[k] = data
        return `mem://thumbnails/${k}.jpg`
      },
    },
    layout: {
      async getEpisodeLayout() {
        return YAML
      },
    },
    __dump() {
      return { renders, thumbs }
    },
  } as unknown as StoragePorts & { __dump(): { renders: typeof renders; thumbs: typeof thumbs } }
}

// Mock vertical text API client and node-canvas image creation
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalText: vi.fn().mockResolvedValue({
    meta: { image_base64: 'x', width: 120, height: 300 },
    pngBuffer: Buffer.from('iVBOR', 'base64'),
  }),
}))

describe.skip('integration: renderBatchFromYaml with vertical text', () => {
  const OLD_ENV = { ...process.env }
  beforeEach(() => {
    process.env = { ...OLD_ENV, NODE_ENV: 'development' }
    // Don't reset modules as it clears our mocks
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('renders page successfully, scaling dialogue images to fit', async () => {
    // Set up mocks like the bounds test does
    const { renderVerticalText } = await import('@/services/vertical-text-client')
    ;(renderVerticalText as any).mockResolvedValue({
      meta: { image_base64: 'x', width: 120, height: 300 },
      pngBuffer: Buffer.from('iVBOR', 'base64'),
    })

    // Mock createImageFromBuffer 
    const canvasMod = await import('@/lib/canvas/canvas-renderer')
    // @ts-expect-error test shim
    canvasMod.CanvasRenderer.createImageFromBuffer = vi.fn().mockReturnValue({
      image: { __img: true },
      width: 120,
      height: 300,
    })

    const ports = makeMemoryRenderPorts()
    const res = await renderBatchFromYaml('job', 1, YAML, [1], { concurrency: 1 }, ports)

    expect(res.success).toBe(true)
    expect(res.failedPages).toBe(0)
    expect(res.renderedPages).toBe(1)
    expect(res.results[0]?.renderKey).toMatch(/mem:\/\/renders\/job\/1\/1\.png/)

    // Ensure the vertical client was called twice (two dialogues)
    expect((renderVerticalText as any).mock.calls.length).toBe(2)

    // Ensure buffers were written
    const dump = (ports as any).__dump()
    expect(Object.keys(dump.renders)).toContain('job/1/1')
    expect(dump.renders['job/1/1']).toBeInstanceOf(Buffer)
  })
})

