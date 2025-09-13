import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelLayoutCoordinator } from '@/lib/canvas/panel-layout-coordinator'
import type { Dialogue } from '@/types/panel-layout'

describe('PanelLayoutCoordinator', () => {
  let coordinator: PanelLayoutCoordinator
  let mockCtx: CanvasRenderingContext2D

  beforeEach(() => {
    coordinator = new PanelLayoutCoordinator()
    // 最小限のmeasureTextのみを備えたモック
    mockCtx = {
      font: '',
      measureText: vi.fn((text: string) => ({ width: text.length * 8 }) as TextMetrics),
    } as unknown as CanvasRenderingContext2D
  })

  describe('calculateContentTextPlacement', () => {
    it('吹き出しを避けて配置する', () => {
      const panelBounds = { x: 0, y: 0, width: 500, height: 400 }
      coordinator.registerDialogueArea(
        { speaker: 'A', text: 'test', emotion: 'normal' } as Dialogue,
        { x: 250, y: 50, width: 200, height: 100 },
      )
      const config = { minFontSize: 10, maxFontSize: 14, padding: 8, lineHeight: 1.4 }
      const placement = coordinator.calculateContentTextPlacement(
        '説明テキスト',
        panelBounds,
        mockCtx,
        config,
      )
      expect(placement).not.toBeNull()
      expect(placement!.x).toBeLessThan(250)
    })

    it('複数の占有領域を避ける', () => {
      const panelBounds = { x: 0, y: 0, width: 500, height: 400 }
      coordinator.registerDialogueArea(
        { speaker: 'A', text: 'test1', emotion: 'normal' } as Dialogue,
        { x: 250, y: 50, width: 200, height: 80 },
      )
      coordinator.registerSfxArea(
        { text: 'ドーン', x: 50, y: 200, fontSize: 30 },
        { width: 100, height: 40 },
      )
      const config = { minFontSize: 10, maxFontSize: 14, padding: 8, lineHeight: 1.4 }
      const placement = coordinator.calculateContentTextPlacement(
        '長い説明テキストが入ります',
        panelBounds,
        mockCtx,
        config,
      )
      expect(placement).not.toBeNull()
      const overlapsDialogue =
        placement!.x < 250 + 200 &&
        placement!.x + placement!.width > 250 &&
        placement!.y < 50 + 80 &&
        placement!.y + placement!.height > 50
      const overlapsSfx =
        placement!.x < 50 + 100 &&
        placement!.x + placement!.width > 50 &&
        placement!.y < 200 + 40 &&
        placement!.y + placement!.height > 200
      expect(overlapsDialogue || overlapsSfx).toBe(false)
    })

    it('長いテキストを適切に改行する', () => {
      const panelBounds = { x: 0, y: 0, width: 500, height: 400 }
      const config = { minFontSize: 10, maxFontSize: 14, padding: 8, lineHeight: 1.4 }
      const longText =
        '非常に長い説明テキストが入っています。このテキストは複数行に分割される必要があります。'
      const placement = coordinator.calculateContentTextPlacement(
        longText,
        panelBounds,
        mockCtx,
        config,
      )
      expect(placement).not.toBeNull()
      expect(placement!.lines.length).toBeGreaterThan(1)
      expect(placement!.fontSize).toBeGreaterThanOrEqual(config.minFontSize)
      expect(placement!.fontSize).toBeLessThanOrEqual(config.maxFontSize)
    })
  })

  describe('wrapText', () => {
    it('日本語テキストを適切に改行する', () => {
      const text = 'これは日本語のテストテキストです。改行が正しく行われることを確認します。'
      const lines = coordinator.wrapText(text, 200, mockCtx)
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) {
        const width = mockCtx.measureText(line).width
        expect(width).toBeLessThanOrEqual(200)
      }
    })

    it('改行文字を保持する', () => {
      const text = '一行目\n二行目\n三行目'
      const lines = coordinator.wrapText(text, 500, mockCtx)
      expect(lines.length).toBeGreaterThanOrEqual(3)
    })
  })
})
