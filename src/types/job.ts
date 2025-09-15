export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
export type JobStep =
  | 'initialized'
  | 'split'
  | 'analyze'
  | 'episode'
  | 'layout'
  | 'render'
  | 'complete'

// Drizzle types are now the primary types, imported from @/db/schema
// Keep only custom types that extend or are unique to this domain

export interface JobProgress {
  currentStep: JobStep
  processedChunks: number
  totalChunks: number
  episodes: EpisodeBoundary[]
  // Per-episode page progress: actualPages (YAML/generated), rendered (images)
  perEpisodePages?: Record<
    number,
    {
      actualPages: number
      rendered: number
      validation?: {
        normalizedPages: number[]
        pagesWithIssueCounts: Record<number, number>
        issuesCount: number
      }
    }
  >
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
  title?: string
  summary?: string
  startCharIndex: number
  endCharIndex: number
}

// RetryableError は '@/errors/retryable-error' のクラスを使用します

export interface AnalyzeRequest {
  text: string
}

export interface AnalyzeResponse {
  success: true
  id: string
  message: string
  data: {
    jobId: string
    chunkCount: number
  }
  metadata: {
    timestamp: string
  }
}

export interface JobResponse {
  job: {
    id: string
    novelId: string
    jobName?: string | null
    status: JobStatus
    currentStep: string
    totalChunks: number | null
    processedChunks: number | null
    totalEpisodes: number | null
    processedEpisodes: number | null
    totalPages: number | null
    renderedPages: number | null
    splitCompleted: boolean | null
    analyzeCompleted: boolean | null
    episodeCompleted: boolean | null
    layoutCompleted: boolean | null
    renderCompleted: boolean | null
    lastError: string | null
    lastErrorStep: string | null
    retryCount: number | null
    createdAt: string
    updatedAt: string | null
    startedAt: string | null
    completedAt: string | null
    chunksDirPath: string | null
    analysesDirPath: string | null
    episodesDataPath: string | null
    layoutsDirPath: string | null
    rendersDirPath: string | null
    resumeDataPath: string | null
  }
  chunks: Array<{
    id: string
    novelId: string
    jobId: string
    chunkIndex: number
    contentPath: string
    startPosition: number
    endPosition: number
    wordCount?: number | null
    createdAt: string
  }>
}
