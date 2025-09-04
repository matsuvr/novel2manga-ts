import { appConfig } from '@/config/app.config'
import type { PageBreakV2 } from '@/types/script'

export interface NormalizationReport {
  uniqueCount: number
  limitedTo: number
  wasNormalized: boolean
}

export interface NormalizeOptions {
  maxPages?: number
}

// Normalize panel page numbers into a safe contiguous 1..N range with a hard cap.
// Keeps other properties intact while ensuring pageNumber is a positive integer within limits.
export function normalizePlanPanels<T extends { pageNumber?: number }>(
  panels: ReadonlyArray<T>,
  options: NormalizeOptions = {},
): { normalized: Array<T & { pageNumber: number }>; report: NormalizationReport } {
  const MAX_PAGES: number = options.maxPages ?? appConfig.rendering.limits.maxPages

  // 1) Sanitize to integer >= 1
  const cleaned = panels.map((p) => ({
    ...p,
    pageNumber: Math.max(1, Math.floor(Number(p.pageNumber ?? 1))),
  }))

  // 2) Unique + sort actual page numbers
  const uniqSorted = Array.from(new Set(cleaned.map((p) => p.pageNumber))).sort((a, b) => a - b)

  // 3) Apply cap for safety
  const limited = uniqSorted.slice(0, MAX_PAGES)

  // 4) Map to dense range 1..N
  const map = new Map<number, number>(limited.map((v, i) => [v, i + 1]))
  const normalized = cleaned.map((p) => ({ ...p, pageNumber: map.get(p.pageNumber) ?? 1 }))

  const wasNormalized =
    uniqSorted.length !== limited.length || !uniqSorted.every((v, i) => v === limited[i])

  return {
    normalized,
    report: {
      uniqueCount: uniqSorted.length,
      limitedTo: limited.length,
      wasNormalized,
    },
  }
}

// Utility to compute max page after normalization without caring about other fields.
export function getMaxNormalizedPage(
  panels: ReadonlyArray<{ pageNumber?: number }>,
  options: NormalizeOptions = {},
): number {
  const { normalized } = normalizePlanPanels(panels, options)
  return Math.max(1, ...normalized.map((p) => p.pageNumber))
}

// Shared loose panel type used by callers before strict validation
export type LoosePanel = Partial<PageBreakV2['panels'][0]> & { pageNumber?: number }
