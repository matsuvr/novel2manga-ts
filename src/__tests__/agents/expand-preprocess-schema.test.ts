import { describe, expect, it } from 'vitest'
import { ExpandPreprocessResultSchema } from '@/agents/expand-preprocess'

describe('ExpandPreprocessResultSchema', () => {
  it('validates a correct object', () => {
    const obj = {
      expandedText: 'a'.repeat(60),
      notes: ['note1', 'note2'],
    }
    const parsed = ExpandPreprocessResultSchema.parse(obj)
    expect(parsed.expandedText.length).toBe(60)
    expect(parsed.notes).toHaveLength(2)
  })

  it('rejects too short expandedText', () => {
    const obj = {
      expandedText: 'short',
      notes: [],
    }
    const result = ExpandPreprocessResultSchema.safeParse(obj)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('>= 50')
    }
  })

  it('rejects unexpected extra keys', () => {
    const obj: any = {
      expandedText: 'a'.repeat(55),
      notes: [],
      extra: 'oops',
    }
    const result = ExpandPreprocessResultSchema.safeParse(obj)
    expect(result.success).toBe(false)
  })
})
