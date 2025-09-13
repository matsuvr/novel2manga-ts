import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Panel } from '@/types/panel-layout'

const mockCtx = (() => {
  const calls: Record<string, unknown[]> = {}
  const fn = (name: string) =>
    vi.fn((...args: unknown[]) => {
      ;(calls[name] ||= []).push(args)
    })
  const ctx = {
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
    strokeText: fn('strokeText'),
    measureText: vi.fn(() => ({ width: 42 })),
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set font(_: string) {},
    translate: fn('translate'),
    rotate: fn('rotate'),
  } as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D
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

describe('Panel elements do not overlap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function rectsOverlap(
    r1: { x: number; y: number; width: number; height: number },
    r2: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(
      r1.x + r1.width <= r2.x ||
      r2.x + r2.width <= r1.x ||
      r1.y + r1.height <= r2.y ||
      r2.y + r2.height <= r1.y
    )
  }

  it('avoids overlap among dialogue, sfx and content', async () => {
    vi.resetModules()
    delete (globalThis as Record<string, unknown>).window
    const { CanvasRenderer } = await import('@/lib/canvas/canvas-renderer')
    const renderer = await CanvasRenderer.create({ width: 800, height: 600 })

    const panel: Panel = {
      id: 'p1',
      position: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
      content: '説明テキスト',
      dialogues: [
        { speaker: 'A', text: 'foo', type: 'speech' },
        { speaker: 'B', text: 'bar', type: 'speech' },
      ],
      sfx: ['ドーン'],
    }

    const imgMock = {} as CanvasImageSource
    renderer.setDialogueAssets({
      'p1:0': { image: imgMock, width: 80, height: 100 },
      'p1:1': { image: imgMock, width: 80, height: 100 },
    })

    // @ts-expect-error - access private sfxPlacer for spying
    const sfxSpy = vi.spyOn(renderer.sfxPlacer, 'placeSfx')

    renderer.drawPanel(panel)

    expect(sfxSpy).toHaveBeenCalledOnce()
    const preOcc = sfxSpy.mock.calls[0][3]
    expect(preOcc.length).toBe(2)

    const areas = renderer.getLayoutCoordinator().getOccupiedAreas()
    const dialogues = areas.filter((a) => a.type === 'dialogue')
    const sfx = areas.filter((a) => a.type === 'sfx')
    const content = areas.filter((a) => a.type === 'content')

    expect(dialogues.length).toBe(2)
    expect(sfx.length).toBe(1)
    expect(content.length).toBe(1)

    for (const d of dialogues) {
      for (const s of sfx) expect(rectsOverlap(d, s)).toBe(false)
      for (const c of content) expect(rectsOverlap(d, c)).toBe(false)
    }
    for (const s of sfx) {
      for (const c of content) expect(rectsOverlap(s, c)).toBe(false)
    }
  })
})
