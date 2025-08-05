// Episode analysis and boundary detection types
import type { ChunkAnalysisResult } from './chunk'

export interface NarrativeAnalysisInput {
  jobId: string
  chunks: {
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
  }[]
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  startingEpisodeNumber: number
  isMiddleOfNovel: boolean
  previousEpisodeEndText?: string
  previousContext?: {
    lastEpisodeNumber: number
    lastCharacterPosition: number
    unfinishedPlotPoints: string[]
  }
}

export interface NarrativeAnalysisResult {
  episodes: EpisodeBoundary[]
  confidence: number
  reasoning: string
}

export interface EpisodeBoundary {
  episodeNumber: number
  title?: string
  summary?: string
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  estimatedPages: number
  confidence: number
  plotPoints?: string[]
  emotionalArc?: string
  cliffhanger?: boolean
}