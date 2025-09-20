import { describe, expect, it, vi } from 'vitest'

import { PanelLayoutCoordinator } from '@/lib/canvas/panel-layout-coordinator'
import type { Dialogue } from '@/types/panel-layout'
import { createCanvas2DMock } from '../../tests/helpers/createCanvas2DMock'

const intersects = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )

describe('PanelLayoutCoordinator', () => {
  it('allocates content bounding boxes that avoid registered areas', () => {
    const coordinator = new PanelLayoutCoordinator()
    const ctx = createCanvas2DMock()
    const measureSpy = vi.spyOn(ctx, 'measureText').mockImplementation(
      (text: string) =>
        ({ width: text.length * 8 } as ReturnType<CanvasRenderingContext2D['measureText']>),
    )

    const dialogue: Dialogue = {
      speaker: '検証用キャラ',
      text: 'サンプルのセリフです',
      emotion: 'neutral',
      type: 'speech',
    }

    coordinator.registerDialogueArea(dialogue, { x: 220, y: 40, width: 140, height: 160 })
    coordinator.registerSfxArea(
      { text: 'ドン', x: 60, y: 180, fontSize: 48 },
      { width: 120, height: 80 },
    )

    const panelBounds = { x: 0, y: 0, width: 400, height: 400 }
    const placement = coordinator.calculateContentTextPlacement(
      '状況説明がここに入ります。',
      panelBounds,
      ctx,
      {
        minFontSize: 16,
        maxFontSize: 24,
        padding: 8,
        lineHeight: 1.4,
        maxWidthRatio: 0.8,
        maxHeightRatio: 0.4,
        minAreaSize: 80,
      },
    )

    expect(placement).not.toBeNull()
    if (!placement) return

    expect(placement.lines.length).toBeGreaterThan(0)
    expect(measureSpy).toHaveBeenCalled()

    const bubbleRect = { x: 220, y: 40, width: 140, height: 160 }
    const sfxRect = { x: 60, y: 180, width: 120, height: 80 }

    expect(intersects(placement.boundingBox, bubbleRect)).toBe(false)
    expect(intersects(placement.boundingBox, sfxRect)).toBe(false)

    expect(placement.boundingBox.x).toBeGreaterThanOrEqual(panelBounds.x)
    expect(placement.boundingBox.y).toBeGreaterThanOrEqual(panelBounds.y)
    expect(placement.boundingBox.x + placement.boundingBox.width).toBeLessThanOrEqual(
      panelBounds.x + panelBounds.width,
    )
    expect(placement.boundingBox.y + placement.boundingBox.height).toBeLessThanOrEqual(
      panelBounds.y + panelBounds.height,
    )
  })

  it('wraps narration text with BudouX and scales down when height is constrained', () => {
    const coordinator = new PanelLayoutCoordinator()
    const ctx = createCanvas2DMock()
    vi.spyOn(ctx, 'measureText').mockImplementation(
      (text: string) =>
        ({ width: text.length * 20 } as ReturnType<CanvasRenderingContext2D['measureText']>),
    )

    const panelBounds = { x: 0, y: 0, width: 220, height: 140 }
    const content = '長い状況説明がここに入ります。雨が強く降り続いています。'

    const placement = coordinator.calculateContentTextPlacement(content, panelBounds, ctx, {
      minFontSize: 18,
      maxFontSize: 26,
      padding: 8,
      lineHeight: 1.4,
      maxWidthRatio: 0.4,
      maxHeightRatio: 0.35,
      minAreaSize: 60,
      fontFamily: 'Noto Sans JP',
    })

    expect(placement).not.toBeNull()
    if (!placement) return

    expect(placement.lines.length).toBeGreaterThan(0)
    expect(placement.lines.join('')).toBe(content)
    expect(placement.lines.some((line) => line.endsWith('...'))).toBe(false)
    expect(Math.max(...placement.lines.map((line) => line.length))).toBeLessThanOrEqual(4)
    expect(placement.fontSize).toBeLessThan(18)
  })
})
