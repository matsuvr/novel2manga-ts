import { describe, expect, it } from 'vitest'
import { EmotionSchema, normalizeEmotion } from '@/domain/models/emotion'

describe('domain/emotion', () => {
  it('accepts known emotions', () => {
    const emotions = [
      'neutral',
      'normal',
      'happy',
      'sad',
      'angry',
      'surprised',
      'fear',
      'disgust',
      'question',
      'shout',
      'thought',
      'think',
      'inner',
      'excited',
    ]
    for (const e of emotions) {
      expect(() => EmotionSchema.parse(e)).not.toThrow()
    }
  })

  it('normalizes synonyms to canonical values', () => {
    expect(normalizeEmotion('think')).toBe('thought')
    expect(normalizeEmotion('inner')).toBe('thought')
    expect(normalizeEmotion('unknown-value')).toBe('normal')
    expect(normalizeEmotion(undefined)).toBeUndefined()
  })
})
