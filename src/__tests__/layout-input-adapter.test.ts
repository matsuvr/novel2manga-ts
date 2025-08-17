import { describe, expect, it } from 'vitest'
import { buildLayoutLLMInput } from '@/agents/layout/input-adapter'
import type { EpisodeData } from '@/types/panel-layout'

describe('buildLayoutLLMInput', () => {
  it('should build LLM input with simplified chunks and constraints', () => {
    const episode: EpisodeData = {
      chunkAnalyses: [],
      author: 'Author',
      title: 'Episode 1' as const,
      episodeNumber: 1,
      episodeTitle: 'Prologue',
      episodeSummary: 'Summary',
      startChunk: 0,
      startCharIndex: 0,
      endChunk: 1,
      endCharIndex: 100,
      estimatedPages: 3,
      chunks: [
        {
          chunkIndex: 0,
          text: 'Hello world',
          analysis: {
            chunkIndex: 0,
            summary: 'sum',
            characters: [{ name: 'A', role: 'protagonist', description: '' }],
            scenes: [
              { time: false, location: true, setting: 'room', mood: 'calm', visualElements: [] },
            ],
            dialogues: [{ emotion: 'neutral', speaker: 'A', text: 'Hi', context: '' }],
            highlights: [
              { description: '', type: 'plot', text: 'boom', importance: 7, reason: '' },
            ],
            situations: [],
          },
        },
        {
          chunkIndex: 1,
          text: 'Next',
          analysis: {
            chunkIndex: 1,
            summary: 'sum2',
            characters: [{ name: 'B', role: 'supporting', description: '' }],
            scenes: [
              { time: true, location: false, setting: 'street', mood: 'tense', visualElements: [] },
            ],
            dialogues: [],
            highlights: [],
            situations: [],
          },
        },
      ],
    }

    const input = buildLayoutLLMInput(episode)
    expect(input.episodeData.episodeNumber).toBe(1)
    expect(input.targetPages).toBe(3)
    expect(input.layoutConstraints.avoidEqualGrid).toBe(true)
    expect(input.episodeData.chunks.length).toBe(2)
    expect(input.episodeData.chunks[0].hasHighlight).toBe(true)
    expect(input.episodeData.chunks[1].dialogueCount).toBe(0)
  })
})
