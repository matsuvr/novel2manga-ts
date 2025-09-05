import type { ChunkData } from '@/types/chunk'

export interface EpisodeBoundaryInput {
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
}

// Validate that episode boundaries lie within available chunks and text ranges
export function validateEpisodeBoundaries(
  boundaries: EpisodeBoundaryInput[],
  chunks: ChunkData[],
): boolean {
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]

    const startChunk = chunks.find((c) => c.chunkIndex === boundary.startChunk)
    const endChunk = chunks.find((c) => c.chunkIndex === boundary.endChunk)
    if (!startChunk || !endChunk) {
      return false
    }

    if (
      boundary.startCharIndex < 0 ||
      boundary.startCharIndex > startChunk.text.length ||
      boundary.endCharIndex < 0 ||
      boundary.endCharIndex > endChunk.text.length
    ) {
      return false
    }

    if (i > 0) {
      const prev = boundaries[i - 1]
      if (
        boundary.startChunk < prev.endChunk ||
        (boundary.startChunk === prev.endChunk && boundary.startCharIndex < prev.endCharIndex)
      ) {
        return false
      }
    }
  }
  return true
}
