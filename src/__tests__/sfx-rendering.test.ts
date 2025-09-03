import { describe, expect, test } from 'vitest'
import { SfxPlacer } from '@/lib/canvas/sfx-placer'

describe('SFX Text Processing', () => {
  test('parseSfxText should remove angle brackets and prefix correctly', () => {
    const placer = new SfxPlacer()

    // @ts-expect-error private access for test
    const result1 = placer['parseSfxText']('〈ドーン！〉')
    expect(result1.main).toBe('ドーン！')
    expect(result1.supplement).toBeUndefined()

    // @ts-expect-error private access for test
    const result2 = placer['parseSfxText']('〈バタン（ドアが閉まる音）〉')
    expect(result2.main).toBe('バタン')
    expect(result2.supplement).toBe('ドアが閉まる音')

    // @ts-expect-error private access for test
    const result3 = placer['parseSfxText']('sfx: ガシャン(グラスが割れる音)')
    expect(result3.main).toBe('ガシャン')
    expect(result3.supplement).toBe('グラスが割れる音')

    // @ts-expect-error private access for test
    const result4 = placer['parseSfxText']('⟨ズドーン！⟩')
    expect(result4.main).toBe('ズドーン！')
    expect(result4.supplement).toBeUndefined()
  })

  test('parseSfxText should handle edge cases', () => {
    const placer = new SfxPlacer()

    // @ts-expect-error private access for test
    const result1 = placer['parseSfxText']('')
    expect(result1.main).toBe('')

    // @ts-expect-error private access for test
    const result2 = placer['parseSfxText']('ドーン！')
    expect(result2.main).toBe('ドーン！')

    // @ts-expect-error private access for test
    const result3 = placer['parseSfxText']('〈〉')
    expect(result3.main).toBe('')

    // @ts-expect-error private access for test
    const result4 = placer['parseSfxText']('〈ドーン（バン（内側）外側）〉')
    expect(result4.main).toBe('ドーン')
    expect(result4.supplement).toBe('バン（内側）外側')
  })
})
