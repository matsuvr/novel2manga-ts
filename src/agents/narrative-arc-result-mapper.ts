import type { ChunkAnalysisResult } from '@/types/chunk'
import type { EpisodeBoundary } from '@/types/episode'

interface RawBoundary {
  startPosition: number
  endPosition: number
  episodeNumber: number
  title?: string
  summary?: string
  estimatedPages: number
  confidence: number
  reasoning: string
}

export class NarrativeArcResultMapper {
  map(
    rawBoundaries: RawBoundary[],
    chunks: Array<{
      chunkIndex: number
      text: string
      analysis: {
        summary: string
        characters: { name: string; role: string }[]
        dialogues: ChunkAnalysisResult['dialogues']
        scenes: ChunkAnalysisResult['scenes']
        highlights: {
          text: string
          importance: number
          description: string
          startIndex: number
          endIndex: number
        }[]
      }
    }>,
    previousTextLength = 0,
  ): EpisodeBoundary[] {
    const positions: Array<{ chunkIndex: number; startPos: number; endPos: number }> = []
    let currentPos = previousTextLength

    chunks.forEach((chunk) => {
      const chunkLength = chunk.text.length
      positions.push({
        chunkIndex: chunk.chunkIndex,
        startPos: currentPos,
        endPos: currentPos + chunkLength,
      })
      currentPos += chunkLength
    })

    const findChunkAndOffset = (position: number): { chunkIndex: number; charIndex: number } => {
      for (const pos of positions) {
        if (position >= pos.startPos && position <= pos.endPos) {
          return { chunkIndex: pos.chunkIndex, charIndex: position - pos.startPos }
        }
      }
      const last = positions[positions.length - 1]
      return { chunkIndex: last.chunkIndex, charIndex: last.endPos - last.startPos }
    }

    return rawBoundaries.map((boundary) => {
      const start = findChunkAndOffset(boundary.startPosition)
      const end = findChunkAndOffset(boundary.endPosition)

      return {
        startChunk: start.chunkIndex,
        startCharIndex: start.charIndex,
        endChunk: end.chunkIndex,
        endCharIndex: end.charIndex,
        episodeNumber: boundary.episodeNumber,
        title: boundary.title,
        summary: boundary.summary,
        estimatedPages: boundary.estimatedPages,
        confidence: boundary.confidence,
      }
    })
  }
}
