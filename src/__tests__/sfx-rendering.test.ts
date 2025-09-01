import { describe, expect, test } from 'vitest'
import { CanvasRenderer } from '@/lib/canvas/canvas-renderer'

describe('SFX Text Processing', () => {
  test('processSfxText should remove angle brackets correctly', () => {
    const renderer = new (CanvasRenderer as any)({
      width: 800,
      height: 600,
      font: 'Arial',
      fontSize: 16,
    })

    // Test basic angle bracket removal
    const result1 = renderer.processSfxText('〈ドーン！〉')
    expect(result1.main).toBe('ドーン！')
    expect(result1.supplement).toBeUndefined()

    // Test with supplementary text
    const result2 = renderer.processSfxText('〈バタン（ドアが閉まる音）〉')
    expect(result2.main).toBe('バタン')
    expect(result2.supplement).toBe('ドアが閉まる音')

    // Test with half-width parentheses
    const result3 = renderer.processSfxText('〈ガシャン(グラスが割れる音)〉')
    expect(result3.main).toBe('ガシャン')
    expect(result3.supplement).toBe('グラスが割れる音')

    // Test with different angle bracket types
    const result4 = renderer.processSfxText('⟨ズドーン！⟩')
    expect(result4.main).toBe('ズドーン！')
    expect(result4.supplement).toBeUndefined()
  })

  test('processSfxText should handle edge cases', () => {
    const renderer = new (CanvasRenderer as any)({
      width: 800,
      height: 600,
      font: 'Arial',
      fontSize: 16,
    })

    // Test empty string
    const result1 = renderer.processSfxText('')
    expect(result1.main).toBe('')

    // Test without brackets
    const result2 = renderer.processSfxText('ドーン！')
    expect(result2.main).toBe('ドーン！')

    // Test with only brackets
    const result3 = renderer.processSfxText('〈〉')
    expect(result3.main).toBe('')

    // Test with nested brackets (should not match supplement)
    const result4 = renderer.processSfxText('〈ドーン（バン（内側）外側）〉')
    expect(result4.main).toBe('ドーン')
    expect(result4.supplement).toBe('バン（内側）外側')
  })
})
