import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SpeakerResolutionSchema } from '@/character/speaker-resolution'

describe('SpeakerResolutionSchema', () => {
  it('parses a valid payload', () => {
    const payload = {
      dialogues: [
        {
          dialogueIndex: 0,
          speakerName: '太郎',
          speakerType: 'person',
          confidence: 0.9,
          reasoning: '文脈から明らか'
        }
      ],
      namedEntities: [
        { name: '太郎', type: 'person' },
        { name: '東京', type: 'location' }
      ]
    }

    const result = SpeakerResolutionSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dialogues.length).toBe(1)
      expect(result.data.namedEntities.length).toBe(2)
    }
  })

  it('rejects payload missing dialogues', () => {
    const payload = {
      namedEntities: [{ name: '太郎', type: 'person' }]
    }

    const result = SpeakerResolutionSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects dialogue with missing speakerType', () => {
    const payload = {
      dialogues: [
        {
          dialogueIndex: 0,
          speakerName: '太郎'
        }
      ],
      namedEntities: []
    }

    const result = SpeakerResolutionSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })
})
