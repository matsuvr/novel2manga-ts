import { describe, expect, it } from 'vitest'
import type { ChunkData } from '@/types/chunk'
import { validateEpisodeBoundaries } from '@/utils/episode-utils'

describe('validateEpisodeBoundaries', () => {
  const chunks: ChunkData[] = [
    { chunkIndex: 0, text: 'foo' },
    { chunkIndex: 1, text: 'bar' },
  ]

  it('returns true for valid boundaries', () => {
    const result = validateEpisodeBoundaries(
      [{ startChunk: 0, startCharIndex: 0, endChunk: 1, endCharIndex: 3 }],
      chunks,
    )
    expect(result).toBe(true)
  })

  it('returns false for invalid indices', () => {
    const result = validateEpisodeBoundaries(
      [{ startChunk: 0, startCharIndex: 0, endChunk: 2, endCharIndex: 1 }],
      chunks,
    )
    expect(result).toBe(false)
  })
})
