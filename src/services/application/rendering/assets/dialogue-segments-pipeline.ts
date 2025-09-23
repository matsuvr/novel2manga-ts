import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'

export interface DialogueSegmentsPipeline {
  prepare(texts: string[]): void
  getSegments(text: string): string[]
  stats(): { cached: number; misses: number; size: number }
}

/**
 * Very lightweight asset pipeline that caches BudouX phrase segmentation results
 * so that repeated dialogue strings across panels/pages do not repeatedly invoke
 * the (relatively) costly segmentation logic.
 *
 * NOTE: We intentionally do NOT pre-compute width-based final line breaks here.
 * Width grouping still depends on actual canvas context metrics. This pipeline
 * only caches phrase-level segmentation (granularity used later for dynamic wrap).
 */
export function createDialogueSegmentsPipeline(maxCharsPerSegment = 20): DialogueSegmentsPipeline {
  const cache = new Map<string, string[]>()
  let cachedHits = 0
  let cacheMisses = 0

  const compute = (text: string) => {
    const segments = wrapJapaneseByBudoux(text, maxCharsPerSegment)
    cache.set(text, segments)
    cacheMisses++
    return segments
  }

  return {
    prepare(texts) {
      for (const t of texts) {
        if (!t || cache.has(t)) continue
        compute(t)
      }
    },
    getSegments(text) {
      if (cache.has(text)) {
        cachedHits++
        return cache.get(text) as string[]
      }
      return compute(text)
    },
    stats() {
      return { cached: cachedHits, misses: cacheMisses, size: cache.size }
    },
  }
}

/**
 * Utility to extract unique dialogue texts from a layout structure.
 */
export function collectDialogueTexts(layout: { pages: Array<{ panels: Array<{ dialogues?: Array<{ text?: string }> }> }> }): string[] {
  const set = new Set<string>()
  for (const p of layout.pages) {
    for (const panel of p.panels) {
      if (!panel.dialogues) continue
      for (const d of panel.dialogues) {
        if (d?.text) set.add(d.text)
      }
    }
  }
  return [...set]
}
