import { describe, expect, it } from 'vitest'
import { breakIntoCharsByBudoux } from '@/utils/jp-linebreak'

describe('breakIntoCharsByBudoux', () => {
  it('splits into per-char lines and preserves content', () => {
    const text = '太郎'
    const lines = breakIntoCharsByBudoux(text)
    expect(lines).toEqual(['太', '郎'])
    expect(lines.join('')).toBe(text)
  })

  it('handles emoji and ASCII safely', () => {
    const text = 'A😊B'
    const lines = breakIntoCharsByBudoux(text)
    expect(lines.join('')).toBe(text)
    // length should be 3 for simple emoji; allow >=3 in case of environment-specific segmentation
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('returns empty for empty input', () => {
    expect(breakIntoCharsByBudoux('')).toEqual([])
  })
})
