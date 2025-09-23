import { describe, expect, it } from 'vitest'
import { MeasureTextCache } from '@/lib/canvas/metrics/measure-text-cache'

// Mock minimal CanvasRenderingContext2D with deterministic width rule
class MockCtx {
  font = '14px test'
  measureText(txt: string) { return { width: txt.length * 10 } as TextMetrics }
}

describe('MeasureTextCache', () => {
  it('caches width and reports hits/misses', () => {
    const cache = new MeasureTextCache(3)
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D
    const w1 = cache.getOrMeasure(ctx, 'hello')
    const w2 = cache.getOrMeasure(ctx, 'hello')
    expect(w1).toBe(w2)
    const stats = cache.stats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(1)
  })

  it('evicts least recently used when capacity exceeded', () => {
    const cache = new MeasureTextCache(2)
    const ctx = new MockCtx() as unknown as CanvasRenderingContext2D
    cache.getOrMeasure(ctx, 'a') // miss
    cache.getOrMeasure(ctx, 'b') // miss
    cache.getOrMeasure(ctx, 'a') // hit (a most recent)
    cache.getOrMeasure(ctx, 'c') // evict b
    const stats = cache.stats()
    expect(stats.size).toBe(2)
    // ensure re-measuring 'b' is a miss again
    const beforeMisses = stats.misses
    cache.getOrMeasure(ctx, 'b')
    expect(cache.stats().misses).toBe(beforeMisses + 1)
  })
})
