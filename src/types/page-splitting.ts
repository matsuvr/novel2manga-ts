export interface PageSegmentRef {
  chunkIndex: number
  startOffset: number
  endOffset: number
}

export interface PlannedPanelHint {
  contentHint?: string
  importance?: number // 1-10
  dialoguesHint?: Array<{ speaker?: string; text?: string }>
  source: PageSegmentRef
}

export interface PlannedPage {
  pageNumber: number
  summary?: string
  importance?: number // 1-10
  segments: PlannedPanelHint[]
}

export interface PageBatchPlan {
  episodeNumber: number
  startPage: number
  plannedPages: PlannedPage[]
  mayAdjustPreviousPages?: boolean
  adjustments?: Partial<Record<number, PlannedPage>> // optional future use
  remainingPagesEstimate?: number
}

export interface PageSplitOptions {
  batchSize: number // e.g., 3 pages
  allowMinorAdjustments: boolean
}
