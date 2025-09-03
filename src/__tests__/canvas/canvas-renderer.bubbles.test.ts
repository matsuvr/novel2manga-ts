import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Panel } from '@/types/panel-layout'

// Mock node-canvas module for server-side rendering
const mockCtx = (() => {
  const calls: Record<string, any[]> = {}
  const fn = (name: string) =>
    vi.fn((...args: any[]) => {
      ;(calls[name] ||= []).push(args)
    })
  const ctx: any = {
    // path & draw
    beginPath: fn('beginPath'),
    fillRect: fn('fillRect'),
    moveTo: fn('moveTo'),
    lineTo: fn('lineTo'),
    rect: fn('rect'),
    strokeRect: fn('strokeRect'),
    ellipse: fn('ellipse'),
    quadraticCurveTo: fn('quadraticCurveTo'),
    closePath: fn('closePath'),
    fill: fn('fill'),
    stroke: fn('stroke'),
    drawImage: fn('drawImage'),
    // state
    save: fn('save'),
    restore: fn('restore'),
    clip: fn('clip'),
    // text
    fillText: fn('fillText'),
    measureText: vi.fn(() => ({ width: 42 })),
    // styles
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set font(_: string) {},
    // transforms
    translate: fn('translate'),
  }
  return { ctx, calls }
})()

vi.mock('canvas', () => ({
  createCanvas: vi.fn(() => ({
    width: 800,
    height: 600,
    getContext: vi.fn(() => mockCtx.ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,x'),
  })),
  Image: class {},
}))

describe('CanvasRenderer bubbles - shapes and labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws rectangle for narration, cloud for thought, ellipse for speech and hides label for narration', async () => {
    // Ensure server-side path in CanvasRenderer (so our 'canvas' mock is used)
    // By re-importing module after deleting window
    vi.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
    const mod = await import('@/lib/canvas/canvas-renderer')
    const { CanvasRenderer } = mod as any
    const renderer = await CanvasRenderer.create({ width: 800, height: 600 })

    const panel: Panel = {
      id: 'p1',
      position: { x: 0.1, y: 0.1 },
      size: { width: 0.8, height: 0.8 },
      content: '',
      dialogues: [
        { speaker: 'ナレーション', text: '説明', type: 'narration' },
        { speaker: '太郎', text: 'こんにちは', type: 'speech' },
        { speaker: '太郎', text: '…', type: 'thought' },
      ],
    }

    // Provide vertical text assets for each dialogue
    renderer.setDialogueAssets({
      'p1:0': { image: { __img: true } as any, width: 100, height: 120 },
      'p1:1': { image: { __img: true } as any, width: 90, height: 110 },
      'p1:2': { image: { __img: true } as any, width: 80, height: 100 },
    })

    renderer.drawPanel(panel)

    // Narration uses rect (rectangle bubble)
    expect(mockCtx.ctx.rect).toHaveBeenCalled()
    // Speech uses ellipse at least once
    expect(mockCtx.ctx.ellipse).toHaveBeenCalled()
    // Thought uses cloud via quadraticCurveTo bumps
    expect(mockCtx.ctx.quadraticCurveTo).toHaveBeenCalled()

    // Speaker label should not render for narration: ensure no label text drawn
    const fillTextArgs: any[] = (mockCtx.ctx as any).fillText.mock.calls.flat()
    expect(fillTextArgs).not.toContain('ナレーション')
  })
})
