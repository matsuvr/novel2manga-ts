import { describe, expect, it } from 'vitest'
import {
  END_INDEX_GTE_START_INDEX_MESSAGE,
  HighlightV2Schema,
  SceneV2Schema,
} from '@/validation/extractionV2'

describe('SceneV2Schema', () => {
  it('accepts equal start and end indices', () => {
    const result = SceneV2Schema.safeParse({
      location: 'loc',
      time: null,
      description: 'desc',
      startIndex: 5,
      endIndex: 5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects endIndex lower than startIndex', () => {
    const result = SceneV2Schema.safeParse({
      location: 'loc',
      time: null,
      description: 'desc',
      startIndex: 5,
      endIndex: 4,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(END_INDEX_GTE_START_INDEX_MESSAGE)
    }
  })
})

describe('HighlightV2Schema', () => {
  it('accepts equal start and end indices', () => {
    const result = HighlightV2Schema.safeParse({
      type: 'climax',
      description: 'desc',
      importance: 3,
      startIndex: 10,
      endIndex: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejects endIndex lower than startIndex', () => {
    const result = HighlightV2Schema.safeParse({
      type: 'climax',
      description: 'desc',
      importance: 3,
      startIndex: 10,
      endIndex: 9,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(END_INDEX_GTE_START_INDEX_MESSAGE)
    }
  })
})
