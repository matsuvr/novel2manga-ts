import { describe, expect, it } from 'vitest'
import type { Dialogue } from '@/types/panel-layout'
import { getFontForDialogue } from '@/types/vertical-text'

describe('getFontForDialogue', () => {
  it('returns mincho for narration type', () => {
    const dialogue: Dialogue = {
      speaker: 'ナレーター',
      text: 'その日、主人公は大切な決断を下した。',
      type: 'narration',
    }
    expect(getFontForDialogue(dialogue)).toBe('mincho')
  })

  it('returns gothic for thought type', () => {
    const dialogue: Dialogue = {
      speaker: '主人公',
      text: '（これで本当に良かったのだろうか...）',
      type: 'thought',
    }
    expect(getFontForDialogue(dialogue)).toBe('gothic')
  })

  it('returns undefined for speech type (uses default antique font)', () => {
    const dialogue: Dialogue = {
      speaker: '主人公',
      text: 'おはよう！',
      type: 'speech',
    }
    expect(getFontForDialogue(dialogue)).toBeUndefined()
  })

  it('returns undefined when type is not specified (uses default antique font)', () => {
    const dialogue: Dialogue = {
      speaker: '主人公',
      text: 'こんにちは！',
      // type not specified
    }
    expect(getFontForDialogue(dialogue)).toBeUndefined()
  })
})
