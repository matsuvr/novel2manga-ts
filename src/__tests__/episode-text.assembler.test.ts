import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { assembleEpisodeText } from '@/services/application/episode-text/assembler'
import { InvariantViolation, ValidationError } from '@/types/errors/episode-error'

const script = {
  panels: [
    { no: 1, narration: ['Intro'] },
    { no: 2, dialogue: [{ text: 'Hello', speaker: 'A', type: 'speech' }] },
    { no: 3, dialogue: [{ text: 'Thinking', speaker: 'B', type: 'thought' }] },
  ],
}

describe('assembleEpisodeText', () => {
  it('assembles valid range', async () => {
    const eff = assembleEpisodeText({ script: script as any, startPanelIndex: 1, endPanelIndex: 2 })
    const res = await Effect.runPromise(eff)
    expect(res.episodeText).toMatch('Intro')
    expect(res.episodeText).toMatch('A: Hello')
    expect(res.panelCount).toBe(2)
  })

  it('fails on invalid range order', async () => {
    const eff = assembleEpisodeText({ script: script as any, startPanelIndex: 3, endPanelIndex: 2 })
    const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') expect(either.left).toBeInstanceOf(ValidationError)
  })

  it('fails when sliced panels empty', async () => {
    const eff = assembleEpisodeText({ script: script as any, startPanelIndex: 10, endPanelIndex: 12 })
    const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') expect(either.left).toBeInstanceOf(ValidationError)
  })

  it('fails when resulting text empty (all blank)', async () => {
    const blankScript = { panels: [{ no: 1, narration: ['   '], dialogue: [{ text: '   ' }] }] }
    const eff = assembleEpisodeText({ script: blankScript as any, startPanelIndex: 1, endPanelIndex: 1 })
    const either = await Effect.runPromise(Effect.either(eff))
    expect(either._tag).toBe('Left')
    if (either._tag === 'Left') expect(either.left).toBeInstanceOf(InvariantViolation)
  })
})
