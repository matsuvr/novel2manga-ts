import { describe, expect, it } from 'vitest'
import { collectDialogueTexts, createDialogueSegmentsPipeline } from '@/services/application/rendering/assets/dialogue-segments-pipeline'

describe('dialogue-segments-pipeline', () => {
  it('collects unique dialogue texts', () => {
    const layout = {
      pages: [
        { panels: [ { dialogues: [ { text: 'こんにちは世界' }, { text: 'テスト' } ] } ] },
        { panels: [ { dialogues: [ { text: 'こんにちは世界' } ] } ] },
      ],
    }
    const texts = collectDialogueTexts(layout as any)
    expect(texts.sort()).toEqual(['こんにちは世界', 'テスト'].sort())
  })

  it('caches segmentation results', () => {
    const pipeline = createDialogueSegmentsPipeline(10)
    const first = pipeline.getSegments('今日は良い天気ですね')
    const second = pipeline.getSegments('今日は良い天気ですね')
    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
    const stats = pipeline.stats()
    expect(stats.misses).toBe(1)
    expect(stats.cached).toBe(1)
  })
})
