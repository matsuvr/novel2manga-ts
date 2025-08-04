// Episode analysis and boundary detection types

export interface NarrativeAnalysisInput {
  jobId: string
  chunkTexts: string[]
  startChunkIndex: number
  targetChars: number
  minChars: number
  maxChars: number
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