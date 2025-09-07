// Episode boundary detection types
export interface EpisodeBoundary {
  episodeNumber: number
  title?: string
  summary?: string
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  confidence: number
  reasoning?: string
  plotPoints?: string[]
  emotionalArc?: string
  cliffhanger?: boolean
  characterList?: string[]
  sceneList?: string[]
  dialogueList?: string[]
  highlightList?: string[]
  situationList?: string[]
}
