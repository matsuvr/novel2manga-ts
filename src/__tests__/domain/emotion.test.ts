import { describe, expect, it } from 'vitest'
import { EmotionSchema } from '@/domain/models/emotion'

describe('domain/emotion (string-only)', () => {
  it('accepts arbitrary strings', () => {
    const samples = ['neutral', 'unknown-value', 'THOUGHT', '  excited  ', '怒り']
    for (const v of samples) {
      expect(() => EmotionSchema.parse(v)).not.toThrow()
    }
  })
})
