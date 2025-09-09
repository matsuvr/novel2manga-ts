// Chunk analysis and processing types

export interface ChunkAnalysisResult {
  chunkIndex: number
  characters: Array<{
    name: string
    role: 'protagonist' | 'antagonist' | 'supporting' | 'minor'
    description?: string
  }>
  scenes: Array<{
    time?: string
    location: string
    timeOfDay?: string
    atmosphere?: string
    description?: string
  }>
  dialogues: Array<{
    text: string
    speakerId: string
    speaker: string
    content: string
    emotion?: string
    importance: 'high' | 'medium' | 'low'
  }>
  highlights: Array<{
    importance: number
    description: string
    endIndex: number
    startIndex: number
    type: 'action' | 'emotion' | 'plot' | 'description'
    content: string
    intensity: number
    relevance: number
  }>
  situations: Array<{
    type: 'conflict' | 'resolution' | 'transition' | 'development'
    description: string
    significance: number
  }>
  narrativeElements: {
    tension: number
    pacing: 'slow' | 'medium' | 'fast'
    emotionalTone: string
    plotRelevance: number
  }
}

export interface ChunkData {
  chunkIndex: number
  text: string
  analysis?: ChunkAnalysisResult
}

export interface ChunkSummary {
  chunkIndex: number
  summary: string
}
