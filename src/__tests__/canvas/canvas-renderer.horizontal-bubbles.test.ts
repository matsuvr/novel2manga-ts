import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Panel } from '@/types/panel-layout'

const mockCtx = (() => {
  const calls: Record<string, any[]> = {}
  const fn = (name: string) =>
    vi.fn((...args: any[]) => {
      ;(calls[name] ||= []).push(args)
    })
  const ctx: any = {
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
    save: fn('save'),
    restore: fn('restore'),
    clip: fn('clip'),
    fillText: fn('fillText'),
    measureText: vi.fn(() => ({ width: 42 })),
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set font(_: string) {},
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

describe('CanvasRenderer bubble layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('places multiple dialogues horizontally', async () => {
    vi.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window
    const mod = await import('@/lib/canvas/canvas-renderer')
    const { CanvasRenderer } = mod as any
    const renderer = await CanvasRenderer.create({ width: 800, height: 600 })

    const registerSpy = vi.spyOn((renderer as any).layoutCoordinator, 'registerDialogueArea')

    const panel: Panel = {
      id: 'p1',
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
      content: '',
      dialogues: [
        { speaker: 'A', text: 'foo', type: 'speech' },
        { speaker: 'B', text: 'bar', type: 'speech' },
      ],
    }

    renderer.setDialogueAssets({
      'p1:0': { image: { __img: true } as any, width: 80, height: 100 },
      'p1:1': { image: { __img: true } as any, width: 80, height: 100 },
    })

    renderer.drawPanel(panel)

    expect(registerSpy).toHaveBeenCalledTimes(2)
    const first = registerSpy.mock.calls[0][1]
    const second = registerSpy.mock.calls[1][1]
    expect(first.y).toBeCloseTo(second.y, 1)
    expect(second.x).toBeGreaterThan(first.x)
  })
})
