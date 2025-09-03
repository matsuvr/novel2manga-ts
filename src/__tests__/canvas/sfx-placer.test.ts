import { beforeEach, describe, expect, it } from 'vitest'
import { SfxPlacer } from '@/lib/canvas/sfx-placer'
import type { Panel } from '@/types/panel-layout'

// Helper function to check for rectangle overlap (inclusive)
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

describe('SfxPlacer', () => {
  let placer: SfxPlacer

  beforeEach(() => {
    placer = new SfxPlacer()
  })

  describe('parseSfxText', () => {
    it('sfx: プレフィックスを正しく除去する', () => {
      // @ts-expect-error - private method intentional access for test
      expect(placer['parseSfxText']('sfx: ガタッ（扉の音）')).toEqual({
        main: 'ガタッ',
        supplement: '扉の音',
      })

      // @ts-expect-error - private method intentional access for test
      expect(placer['parseSfxText']('SFX: ドカーン')).toEqual({
        main: 'ドカーン',
        supplement: undefined,
      })

      // @ts-expect-error - private method intentional access for test
      expect(placer['parseSfxText']('ガタガタ（椅子が揺れる）')).toEqual({
        main: 'ガタガタ',
        supplement: '椅子が揺れる',
      })

      // @ts-expect-error - private method intentional access for test
      expect(placer['parseSfxText']('〈バタン〉')).toEqual({
        main: 'バタン',
        supplement: undefined,
      })
    })
  })

  describe('placeSfx', () => {
    it('重ならないように配置する', () => {
      const panel: Panel = {
        id: 1,
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        content: '',
        dialogues: [{ speaker: 'テスト', text: 'セリフ', emotion: 'normal' }],
        sfx: ['ドーン', 'ガタッ'],
      }

      const bounds = { x: 0, y: 0, width: 500, height: 400 }
      const placements = placer.placeSfx(panel.sfx!, panel, bounds)

      expect(placements).toHaveLength(2)
      expect(placements[0].text).toBe('ドーン')
      expect(placements[1].text).toBe('ガタッ')

      const differentPosition =
        placements[0].x !== placements[1].x || placements[0].y !== placements[1].y
      expect(differentPosition).toBe(true)
    })

    it('事前占有領域（吹き出し/説明）を避ける', () => {
      const panel: Panel = {
        id: 2,
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        content: '説明テキスト説明テキスト説明テキスト',
        sfx: ['ドカーン'],
      }
      const bounds = { x: 0, y: 0, width: 600, height: 500 }
      const preOccupied = [{ x: 300, y: 100, width: 250, height: 150 }]
      const placements = placer.placeSfx(panel.sfx!, panel, bounds, preOccupied)
      expect(placements).toHaveLength(1)
      const p = placements[0]
      const sfxRect = {
        x: p.x,
        y: p.y,
        width: Math.max(1, p.text.length * p.fontSize * 0.8),
        height: p.fontSize * 1.5,
      }
      const occ = preOccupied[0]
      const overlap = rectsOverlap(sfxRect, occ)
      expect(overlap).toBe(false)
    })
  })
})
