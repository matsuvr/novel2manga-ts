import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import type { MangaLayout, Panel } from '@/types/panel-layout'

// Minimal mock CanvasRenderer to observe setDialogueAssets being called
class MockCanvasRenderer {
  public canvas = { width: 800, height: 1200 } as unknown as HTMLCanvasElement
  public dialogueAssets: Record<string, any> | undefined
  renderMangaLayout(_: MangaLayout) {
    // Check that assets exist when render is called
    if (!this.dialogueAssets) throw new Error('Dialogue assets not attached during render')
  }
  toBlob() {
    return new Blob(['x'], { type: 'image/png' })
  }
  cleanup() {}
  setDialogueAssets(a: Record<string, any>) {
    this.dialogueAssets = a
  }
}

// Replace CanvasRenderer.create to return our mock in test context
vi.mock('@/lib/canvas/canvas-renderer', async () => {
  const mod = await vi.importActual('@/lib/canvas/canvas-renderer')
  return {
    ...mod,
    CanvasRenderer: {
      create: async () => new MockCanvasRenderer(),
      createImageFromBuffer: async (b: Buffer) => ({
        image: { width: 10, height: 20 },
        width: 10,
        height: 20,
      }),
    },
  }
})

describe('MangaPageRenderer asset attachment', () => {
  it('attaches dialogue assets before rendering', async () => {
    const renderer = await MangaPageRenderer.create({ pageWidth: 800, pageHeight: 1200 })

    const layout: MangaLayout = {
      title: 'Test',
      author: 'Author',
      created_at: new Date().toISOString(),
      episodeNumber: 1,
      episodeTitle: 'Test',
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 1,
              position: { x: 0, y: 0 },
              size: { width: 100, height: 200 },
              content: 'Scene',
              dialogues: [{ speaker: 'A', text: '「こんにちは」' }],
            } as unknown as Panel,
          ],
        },
      ],
    }

    await expect(renderer.renderToCanvas(layout, 1)).resolves.toBeDefined()
  })
})
