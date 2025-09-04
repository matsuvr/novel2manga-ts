import { describe, expect, it } from 'vitest'
import { insertZwspByBudoux, wrapJapaneseByBudoux } from '@/utils/jp-linebreak'

describe('wrapJapaneseByBudoux', () => {
  it('keeps total content equal and respects max length per line', () => {
    const text = '今日はとても天気ですね。'
    const max = 5
    const lines = wrapJapaneseByBudoux(text, max)
    expect(lines.join('')).toBe(text)
    expect(lines.every((l) => l.length <= max)).toBe(true)
  })

  it('splits long single phrase safely when needed', () => {
    const text = 'スーパーカリフラジリスティックエクスピアリドーシャス'
    const max = 8
    const lines = wrapJapaneseByBudoux(text, max)
    expect(lines.join('')).toBe(text)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((l) => l.length <= max)).toBe(true)
  })

  it('returns empty array for empty text', () => {
    expect(wrapJapaneseByBudoux('', 8)).toEqual([])
  })
})

describe('insertZwspByBudoux', () => {
  it('inserts ZWSP between phrases', () => {
    const text = '今日は天気です。'
    const out = insertZwspByBudoux(text)
    expect(out.replace(/\u200b/g, '')).toBe(text)
    expect(out).not.toBe(text)
  })
})
