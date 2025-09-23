import type { EpisodeBreakPlan, NewMangaScript, PageBreakV2 } from '@/types/script'

export interface LayoutPipelineInput {
  readonly jobId: string
  readonly novelId: string
  readonly script: NewMangaScript
  readonly episodeBreaks: EpisodeBreakPlan
  readonly isDemo?: boolean
}

export interface LayoutPipelineSuccess {
  readonly pageBreakPlan: PageBreakV2
  readonly totalPages: number
  readonly bundledEpisodes: EpisodeBreakPlan
}

export type LayoutPipelineErrorKind =
  | 'SEGMENTATION_FAILED'
  | 'IMPORTANCE_INVARIANT_FAILED'
  | 'LAYOUT_PERSIST_FAILED'
  | 'EPISODE_PERSIST_FAILED'
  | 'ALIGNMENT_FAILED'

export interface LayoutPipelineError {
  readonly kind: LayoutPipelineErrorKind
  readonly message: string
  readonly cause?: unknown
  readonly stage?: string
}

export type LayoutPipelineResult =
  | { success: true; data: LayoutPipelineSuccess }
  | { success: false; error: LayoutPipelineError }

// Ports abstraction (DI friendly) — a light façade over existing service factory + storage
export interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface JobRowShape {
  id: string
  novelId: string
  totalChunks?: number | null
}

export interface EpisodeWritePayload {
  novelId: string
  jobId: string
  episodeNumber: number
  title?: string | null
  summary?: string | null
  startChunk: number
  startCharIndex: number
  endChunk: number
  endCharIndex: number
  startPanelIndex?: number | null
  endPanelIndex?: number | null
  confidence?: number | null
}

export interface LayoutStatusUpsertPayload {
  jobId: string
  episodeNumber: number
  totalPages: number
  totalPanels: number
  layoutPath: string
}

export interface LayoutPipelinePorts {
  readonly logger: LoggerLike
  readonly layoutStorage: {
    put: (key: string, value: string, opts?: Record<string, unknown>) => Promise<void>
  }
  readonly db: {
    jobs: { getJob: (jobId: string) => Promise<JobRowShape | null> }
    layout: { upsertLayoutStatus: (payload: LayoutStatusUpsertPayload) => Promise<void> }
    episodesWriter: { bulkReplaceByJobId: (episodes: EpisodeWritePayload[]) => Promise<void> }
  }
  readonly bundling: { enabled: boolean; minPageCount: number }
  readonly limits: { maxPanelsPerPage: number; maxPagesPerEpisode: number; maxPanelsPerEpisode: number }
}
