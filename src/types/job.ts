export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
export type JobStep =
  | 'initialized'
  | 'split'
  | 'analyze'
  | 'episode'
  | 'layout'
  | 'render'
  | 'complete'

export interface Novel {
  id: string
  title?: string
  author?: string
  originalTextPath: string
  textLength: number
  language: string
  metadataPath?: string
  createdAt: Date
  updatedAt: Date
}

export interface Job {
  id: string
  novelId: string
  jobName?: string
  status: JobStatus
  currentStep: JobStep
  splitCompleted: boolean
  analyzeCompleted: boolean
  episodeCompleted: boolean
  layoutCompleted: boolean
  renderCompleted: boolean
  chunksDirPath?: string
  analysesDirPath?: string
  episodesDataPath?: string
  layoutsDirPath?: string
  rendersDirPath?: string
  totalChunks: number
  processedChunks: number
  totalEpisodes: number
  processedEpisodes: number
  totalPages: number
  renderedPages: number
  lastError?: string
  lastErrorStep?: string
  retryCount: number
  resumeDataPath?: string
  createdAt: Date
  updatedAt: Date
  startedAt?: Date
  completedAt?: Date
}

export interface ExtendedJob extends Job {
  progress: JobProgress | null
}

export interface JobProgress {
  currentStep: JobStep
  processedChunks: number
  totalChunks: number
  episodes: EpisodeBoundary[]
  lastEpisodeEndPosition?: {
    chunkIndex: number
    charIndex: number
    episodeNumber: number
  }
  lastProcessedText?: string
  isCompleted?: boolean
}

export interface EpisodeBoundary {
  episodeNumber: number
  startChunk: number
  endChunk: number
  confidence: number
}

export interface Episode {
  id: string
  novelId: string
  jobId: string
  episodeNumber: number
  title?: string
  summary?: string
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  estimatedPages: number
  confidence: number
  createdAt: Date
}

export interface Chunk {
  id: string
  novelId: string
  jobId: string
  chunkIndex: number
  contentPath: string
  startPosition: number
  endPosition: number
  wordCount?: number
  createdAt: Date
}

export interface AnalyzeRequest {
  text: string
}

export interface AnalyzeResponse {
  jobId: string
  chunkCount: number
  message: string
}

export interface JobResponse {
  job: Job
  chunks: Chunk[]
}
