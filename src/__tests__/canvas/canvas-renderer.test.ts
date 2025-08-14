import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasRenderer } from '@/lib/canvas/canvas-renderer'
import type { MangaLayout, Panel } from '@/types/panel-layout'

// Canvas 2Dコンテキストのモック
const createMockContext = () => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
})

// node-canvasのモック
const canvasInstances: any[] = []
vi.mock('canvas', () => ({
  createCanvas: vi.fn((width: number, height: number) => {
    const mockContext = createMockContext()
    const canvas = {
      width,
      height,
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/png;base64,mockBase64Data'),
      toBuffer: vi.fn((callback?: (err: Error | null, buffer: Buffer) => void) => {
        if (callback) {
          callback(null, Buffer.from('mock image data'))
        }
        return Buffer.from('mock image data')
      }),
    }
    canvasInstances.push(canvas)
    return canvas
  }),
}))

describe('CanvasRenderer', () => {
  let renderer: CanvasRenderer
  let mockContext: ReturnType<typeof createMockContext>

  beforeEach(() => {
    // モックをリセット
    vi.clearAllMocks()
    mockContext = createMockContext()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('正しい設定でCanvasを初期化できる', () => {
      renderer = new CanvasRenderer({
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        fontFamily: 'Arial',
        fontSize: 16,
      })

      expect(renderer.canvas.width).toBe(800)
      expect(renderer.canvas.height).toBe(600)
      // getContext後のmockContextを取得
      const ctx = renderer.canvas.getContext('2d') as any
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600)
    })

    it('デフォルト設定でCanvasを初期化できる', () => {
      renderer = new CanvasRenderer({
        width: 1024,
        height: 768,
      })

      expect(renderer.canvas.width).toBe(1024)
      expect(renderer.canvas.height).toBe(768)
      const ctx = renderer.canvas.getContext('2d') as any
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1024, 768)
    })
  })

  describe('描画機能', () => {
    beforeEach(() => {
      renderer = new CanvasRenderer({
        width: 800,
        height: 600,
      })
    })

    it('フレームを描画できる', () => {
      const ctx = renderer.canvas.getContext('2d') as any
      renderer.drawFrame(10, 20, 100, 150)
      expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 150)
    })

    it('テキストを描画できる', () => {
      const ctx = renderer.canvas.getContext('2d') as any
      renderer.drawText('テストテキスト', 50, 100, {
        font: '20px sans-serif',
        color: '#000000',
      })

      expect(ctx.save).toHaveBeenCalled()
      expect(ctx.fillText).toHaveBeenCalled()
      expect(ctx.restore).toHaveBeenCalled()
    })

    it('吹き出しを描画できる', () => {
      const ctx = renderer.canvas.getContext('2d') as any
      renderer.drawSpeechBubble('こんにちは', 100, 200, {
        maxWidth: 200,
        style: 'normal',
      })

      expect(ctx.save).toHaveBeenCalled()
      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
      expect(ctx.restore).toHaveBeenCalled()
    })

    it('パネルを描画できる', () => {
      const panel: Panel = {
        id: 'panel1',
        position: { x: 0.1, y: 0.1 },
        size: { width: 0.4, height: 0.4 },
        content: 'パネル内容',
        dialogues: [
          {
            text: 'セリフ1',
            speaker: 'キャラA',
            emotion: 'normal',
          },
        ],
      }

      const ctx = renderer.canvas.getContext('2d') as any
      renderer.drawPanel(panel)

      // フレームが描画される
      expect(ctx.strokeRect).toHaveBeenCalled()
      // テキストが描画される
      expect(ctx.fillText).toHaveBeenCalled()
      // 吹き出しが描画される
      expect(ctx.beginPath).toHaveBeenCalled()
    })
  })

  describe('マンガレイアウト描画', () => {
    beforeEach(() => {
      renderer = new CanvasRenderer({
        width: 595,
        height: 842,
      })
    })

    it('マンガレイアウト全体を描画できる', () => {
      const layout: MangaLayout = {
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
                content: 'パネル1',
                dialogues: [],
              },
              {
                id: 'panel2',
                position: { x: 0.5, y: 0 },
                size: { width: 0.5, height: 0.5 },
                content: 'パネル2',
                dialogues: [],
              },
            ],
          },
        ],
      }

      const ctx = renderer.canvas.getContext('2d') as any
      renderer.renderMangaLayout(layout)

      // 背景がクリアされる
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 595, 842)
      // 全体フレームが描画される
      expect(ctx.strokeRect).toHaveBeenCalledWith(0, 0, 595, 842)
      // 各パネルが描画される（2つのパネル）
      expect(ctx.strokeRect).toHaveBeenCalledTimes(3) // 全体フレーム + 2パネル
    })
  })

  describe('画像出力', () => {
    beforeEach(() => {
      renderer = new CanvasRenderer({
        width: 800,
        height: 600,
      })
    })

    it('Blobとして画像を出力できる', async () => {
      const blob = await renderer.toBlob('image/png')

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(0)
    })

    it('JPEG形式で出力できる', async () => {
      const blob = await renderer.toBlob('image/jpeg', 0.8)

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/jpeg')
    })

    it('toDataURLのフォールバックが動作する', async () => {
      // toDataURLが失敗する場合のテスト
      const canvas = renderer.canvas as any
      canvas.toDataURL = vi.fn(() => {
        throw new Error('toDataURL failed')
      })

      const blob = await renderer.toBlob('image/png')

      expect(blob).toBeInstanceOf(Blob)
      expect(canvas.toBuffer).toHaveBeenCalled()
    })
  })

  describe('エラーハンドリング', () => {
    it('不正なCanvasコンテキストでエラーをスローする', () => {
      // getContextがnullを返すようにモック
      vi.mocked(mockContext as any).getContext = vi.fn(() => null)

      expect(() => {
        new CanvasRenderer({
          width: 800,
          height: 600,
        })
      }).toThrow()
    })
  })
})
