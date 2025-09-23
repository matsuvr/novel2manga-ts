import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { buildEpisodePlainText, buildEpisodeTextEffect } from '@/services/application/episode-text/builder'
import { InvariantViolation, ValidationError } from '@/types/errors/episode-error'

const panelsValid = [
  { no: 1, narration: ['Intro'], dialogue: [{ text: 'Hello', speaker: 'A', type: 'speech' }] },
  { no: 2, dialogue: [{ text: 'Think', speaker: 'B', type: 'thought' }], sfx: ['ドン'] },
]

describe('buildEpisodePlainText (pure)', () => {
  it('builds text with narration / dialogue / sfx', () => {
    const res = buildEpisodePlainText(panelsValid as any)
    expect(res.text).toMatch('Intro')
    expect(res.text).toMatch('A: Hello')
    expect(res.text).toMatch('[thought] Think')
    expect(res.text).toMatch('[SFX] ドン')
    expect(res.panelCount).toBe(2)
  })
})

describe('buildEpisodeTextEffect (validation + invariants)', () => {
  it('fails on non contiguous panel numbers', async () => {
    const eff = buildEpisodeTextEffect([
      { no: 1, narration: [] },
      { no: 3, narration: [] },
    ])
  const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') {
      expect(either.left).toBeInstanceOf(ValidationError)
    }
  })

  it('fails when all content empty', async () => {
    const eff = buildEpisodeTextEffect([{ no: 1 }])
  const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') {
      expect(either.left).toBeInstanceOf(InvariantViolation)
    }
  })

  it('succeeds with valid panels', async () => {
    const eff = buildEpisodeTextEffect(panelsValid)
  const res: any = await Effect.runPromise(eff)
    expect(res.episodeText).toMatch('Intro')
  })
})
