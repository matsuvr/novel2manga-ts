export interface EpisodeBoundary {
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  episodeNumber: number
  title?: string
  summary?: string
  estimatedPages: number
  confidence: number
}

export interface NarrativeAnalysisInput {
  chunks: {
    chunkIndex: number
    text: string
    summary?: string
    characters?: string[]
    highlights?: Array<{
      text: string
      importance: number
      context?: string
    }>
  }[]
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  startingEpisodeNumber?: number // エピソード番号の開始位置（デフォルト1）
  previousEpisodeEndText?: string // 前回の最後のエピソードの終わり部分テキスト
  isMiddleOfNovel?: boolean // 長編小説の途中かどうか
}

export interface NarrativeAnalysisResult {
  boundaries: EpisodeBoundary[]
  reasoning: string
  suggestions?: string[]
}

export interface EpisodeCandidate {
  chunks: number[]
  totalChars: number
  estimatedPages: number
  hasNaturalBreak: boolean
  narrativeScore: number
  highlights: Array<{
    text: string
    importance: number
  }>
  characterActions: string[]
}
