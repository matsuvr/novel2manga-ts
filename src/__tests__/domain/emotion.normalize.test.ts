import { describe, expect, it, vi } from 'vitest'
import { normalizeEmotion } from '@/domain/models/emotion'

describe('normalizeEmotion', () => {
  it('folds synonyms to canonical form', () => {
    expect(normalizeEmotion('think')).toBe('thought')
    expect(normalizeEmotion('inner')).toBe('thought')
  })
  it('warns on unknown (non-production)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const val = normalizeEmotion('unknown__value__xyz')
    expect(val).toBe('normal')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('treats whitespace-only as undefined', () => {
    expect(normalizeEmotion('   ')).toBeUndefined()
  })
})
