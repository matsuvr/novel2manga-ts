import type { MangaPanel, NewMangaScript } from '@/types/script'

/**
 * Result of panel index normalization.
 * originalIndex is the original panel.no encountered in order.
 * normalizedIndex is the new contiguous index (1..N).
 */
export interface PanelIndexMappingEntry {
  originalIndex: number
  normalizedIndex: number
}

export interface PanelNormalizationResult {
  panels: MangaPanel[]
  mapping: PanelIndexMappingEntry[]
  /** True if any renumbering or filtering was applied */
  changed: boolean
}

/**
 * Normalize panel indices to 1..N contiguous sequence preserving order of appearance.
 * - Keeps only panels whose no is a positive integer (>=1)
 * - Maintains the original relative order (stable)
 * - Removes duplicates by first occurrence priority
 * - Reassigns panel.no = position (1-based) sequentially
 * - Returns mapping from originalIndex -> normalizedIndex
 *
 * This is intentionally pure/side-effect free: input array objects are shallow-cloned.
 */
export function normalizePanelIndices(script: NewMangaScript): PanelNormalizationResult {
  const panels = script.panels || []
  if (panels.length === 0) {
    return { panels: [], mapping: [], changed: false }
  }

  const seen = new Set<number>()
  const filtered: { original: MangaPanel; originalIndex: number }[] = []
  for (const p of panels) {
    const idx = typeof p.no === 'number' ? p.no : NaN
    if (!Number.isInteger(idx) || idx < 1) {
      continue // skip invalid indices
    }
    if (seen.has(idx)) {
      continue // skip duplicates (first wins)
    }
    seen.add(idx)
    filtered.push({ original: p, originalIndex: idx })
  }

  let changed = false
  if (filtered.length !== panels.length) changed = true

  const renumbered: MangaPanel[] = filtered.map((entry, i) => {
    const newNo = i + 1
    if (entry.original.no !== newNo) changed = true
    return { ...entry.original, no: newNo }
  })

  const mapping: PanelIndexMappingEntry[] = renumbered.map((p, i) => ({
    originalIndex: filtered[i].originalIndex,
    normalizedIndex: p.no,
  }))

  return { panels: renumbered, mapping, changed }
}

/**
 * Convenience helper to produce a new script object with normalized panels.
 */
export function withNormalizedPanels(script: NewMangaScript): { script: NewMangaScript; mapping: PanelIndexMappingEntry[]; changed: boolean } {
  const { panels, mapping, changed } = normalizePanelIndices(script)
  if (!changed) return { script, mapping, changed: false }
  const newScript: NewMangaScript = { ...script, panels }
  return { script: newScript, mapping, changed: true }
}
