import { describe, it, expect } from 'vitest'
import { parseDialogueAndNarration } from '@/agents/script/dialogue-utils'

describe('parseDialogueAndNarration: type propagation', () => {
  it('propagates type from DialogueLine objects', () => {
    const dialogue = [
      { type: 'narration', text: '物語は始まる' },
      { type: 'speech', speaker: '太郎', text: 'やあ！' },
      { type: 'thought', speaker: '太郎（心の声）', text: '本当は緊張してる…' },
    ] as const

    const result = parseDialogueAndNarration(dialogue as any, [])
    expect(result?.[0]).toMatchObject({
      speaker: 'ナレーション',
      type: 'narration',
      text: '物語は始まる',
    })
    expect(result?.[1]).toMatchObject({ speaker: '太郎', type: 'speech', text: 'やあ！' })
    expect(result?.[2]).toMatchObject({ type: 'thought' })
  })

  it('infers type for string lines (speech/thought/narration)', () => {
    const dialogue = ['太郎: 「こんにちは」', '花子（心の声）：本当は怖い…']
    const narration = ['静かな朝だった']

    const result = parseDialogueAndNarration(dialogue, narration)
    expect(result?.[0]).toMatchObject({ speaker: '太郎', type: 'speech', text: 'こんにちは' })
    expect(result?.[1]).toMatchObject({ speaker: '花子（心の声）', type: 'thought' })
    expect(result?.[2]).toMatchObject({ speaker: 'ナレーション', type: 'narration' })
  })
})
