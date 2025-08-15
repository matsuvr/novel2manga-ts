import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfig } from '@/config/app.config'
import { CanvasRenderer } from '@/lib/canvas/canvas-renderer'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import type { MangaLayout } from '@/types/panel-layout'

// CanvasRendererのモック
vi.mock('@/lib/canvas/canvas-renderer', () => ({
  CanvasRenderer: vi.fn().mockImplementation(() => ({
    canvas: {
      width: appConfig.rendering.defaultPageSize.width,
      height: appConfig.rendering.defaultPageSize.height,
      getContext: vi.fn(),
    },
    renderMangaLayout: vi.fn(),
    toBlob: vi.fn().mockResolvedValue(new Blob(['mock image data'], { type: 'image/png' })),
    drawFrame: vi.fn(),
    drawPanel: vi.fn(),
    drawText: vi.fn(),
    drawSpeechBubble: vi.fn(),
  })),
}))

describe('MangaPageRenderer', () => {
  let renderer: MangaPageRenderer
  let mockCanvasRenderer: any

  const mockLayout: MangaLayout = {
    title: 'テストマンガ',
    author: 'テスト作者',
    created_at: new Date().toISOString(),
    episodeNumber: 1,
    episodeTitle: 'テストエピソード',
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 'panel1',
            position: { x: 0, y: 0 },
            size: { width: 0.5, height: 0.5 },
            content: 'パネル1の内容',
            dialogues: [
              {
                text: 'こんにちは',
                speaker: 'キャラA',
                emotion: 'normal',
              },
            ],
          },
          {
            id: 'panel2',
            position: { x: 0.5, y: 0 },
            size: { width: 0.5, height: 0.5 },
            content: 'パネル2の内容',
            dialogues: [],
          },
        ],
      },
      {
        page_number: 2,
        panels: [
          {
            id: 'panel3',
            position: { x: 0, y: 0 },
            size: { width: 1, height: 1 },
            content: 'フルページパネル',
            dialogues: [],
          },
        ],
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    renderer = new MangaPageRenderer({
      pageWidth: appConfig.rendering.defaultPageSize.width,
      pageHeight: appConfig.rendering.defaultPageSize.height,
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
    })

    // CanvasRendererのモックインスタンスを取得
    mockCanvasRenderer = vi.mocked(CanvasRenderer).mock.results[0]?.value
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('正しい設定で初期化できる', () => {
      expect(renderer).toBeDefined()
      expect(vi.mocked(CanvasRenderer)).toHaveBeenCalledWith({
        width: appConfig.rendering.defaultPageSize.width,
        height: appConfig.rendering.defaultPageSize.height,
        defaultFontSize: 14,
        font: 'sans-serif',
      })
    })

    it('デフォルト設定で初期化できる', () => {
      renderer = new MangaPageRenderer()
      expect(vi.mocked(CanvasRenderer)).toHaveBeenCalledWith(
        expect.objectContaining({
          width: appConfig.rendering.defaultPageSize.width,
          height: appConfig.rendering.defaultPageSize.height,
        }),
      )
    })
  })

  describe('ページレンダリング', () => {
    it('指定ページをCanvasにレンダリングできる', async () => {
      const canvas = await renderer.renderToCanvas(mockLayout, 1)

      expect(canvas).toBeDefined()
      expect(canvas.width).toBe(appConfig.rendering.defaultPageSize.width)
      expect(canvas.height).toBe(appConfig.rendering.defaultPageSize.height)
      expect(mockCanvasRenderer.renderMangaLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          pages: expect.arrayContaining([
            expect.objectContaining({
              page_number: 1,
            }),
          ]),
        }),
      )
    })

    it('存在しないページ番号でエラーをスローする', async () => {
      await expect(renderer.renderToCanvas(mockLayout, 999)).rejects.toThrow('Page 999 not found')
    })

    it('ページ番号が負の値でエラーをスローする', async () => {
      await expect(renderer.renderToCanvas(mockLayout, -1)).rejects.toThrow('Page -1 not found')
    })
  })

  describe('画像出力', () => {
    it('PNG形式で画像を出力できる', async () => {
      const blob = await renderer.renderToImage(mockLayout, 1, 'png')

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/png')
      expect(mockCanvasRenderer.toBlob).toHaveBeenCalledWith('png')
    })

    it('JPEG形式で画像を出力できる', async () => {
      const blob = await renderer.renderToImage(mockLayout, 1, 'jpeg')

      expect(blob).toBeInstanceOf(Blob)
      expect(mockCanvasRenderer.toBlob).toHaveBeenCalledWith('jpeg')
    })

    it('WebP形式で画像を出力できる', async () => {
      const blob = await renderer.renderToImage(mockLayout, 1, 'webp')

      expect(blob).toBeInstanceOf(Blob)
      expect(mockCanvasRenderer.toBlob).toHaveBeenCalledWith('webp')
    })
  })

  describe('全ページレンダリング', () => {
    it('すべてのページを一括レンダリングできる', async () => {
      const blobs = await renderer.renderAllPages(mockLayout)

      expect(blobs).toHaveLength(2)
      expect(blobs[0]).toBeInstanceOf(Blob)
      expect(blobs[1]).toBeInstanceOf(Blob)
      expect(mockCanvasRenderer.toBlob).toHaveBeenCalledTimes(2)
    })

    it('空のレイアウトで空配列を返す', async () => {
      const emptyLayout: MangaLayout = {
        ...mockLayout,
        pages: [],
      }

      const blobs = await renderer.renderAllPages(emptyLayout)
      expect(blobs).toEqual([])
    })

    it('formatを指定して全ページレンダリングできる', async () => {
      const blobs = await renderer.renderAllPages(mockLayout, 'jpeg')

      expect(blobs).toHaveLength(2)
      expect(mockCanvasRenderer.toBlob).toHaveBeenCalledWith('jpeg')
    })
  })

  describe('エラーハンドリング', () => {
    it('無効なレイアウトでエラーをスローする', async () => {
      const invalidLayout = {
        ...mockLayout,
        pages: null as any,
      }

      await expect(renderer.renderToCanvas(invalidLayout, 1)).rejects.toThrow()
    })

    it('レンダリング中のエラーを適切に処理する', async () => {
      mockCanvasRenderer.renderMangaLayout.mockImplementation(() => {
        throw new Error('レンダリングエラー')
      })

      await expect(renderer.renderToCanvas(mockLayout, 1)).rejects.toThrow('レンダリングエラー')
    })

    it('Blob生成エラーを適切に処理する', async () => {
      mockCanvasRenderer.toBlob.mockRejectedValue(new Error('Blob生成エラー'))

      await expect(renderer.renderToImage(mockLayout, 1, 'png')).rejects.toThrow('Blob生成エラー')
    })
  })

  describe('パフォーマンス', () => {
    it('大量のパネルを含むページをレンダリングできる', async () => {
      const largeLayout: MangaLayout = {
        ...mockLayout,
        pages: [
          {
            page_number: 1,
            panels: Array.from({ length: 20 }, (_, i) => ({
              id: `panel${i}`,
              position: { x: (i % 4) * 0.25, y: Math.floor(i / 4) * 0.2 },
              size: { width: 0.25, height: 0.2 },
              content: `パネル${i}`,
              dialogues: [],
            })),
          },
        ],
      }

      const canvas = await renderer.renderToCanvas(largeLayout, 1)
      expect(canvas).toBeDefined()
      expect(mockCanvasRenderer.renderMangaLayout).toHaveBeenCalled()
    })
  })
})
