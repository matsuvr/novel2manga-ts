import type { MangaLayout, Panel } from '@/types/panel-layout'
import { referencePages as embeddedReferencePages } from '@/utils/reference-layouts'

type Issue = string

interface ValidationResult {
  valid: boolean
  issues: Issue[]
}

// CONFIGURATION: Tolerance for floating-point comparisons in layout validation
// This epsilon value is used to handle floating-point precision issues when
// comparing panel positions and sizes. A value of 1e-3 (0.001) allows for
// minor rounding errors while still catching meaningful overlaps and gaps.
const EPS = 1e-3 as const

// CONFIGURATION: Stricter tolerance for gap/overlap detection
// Uses 2x the base epsilon for more lenient validation of layout coverage.
// This helps distinguish between minor floating-point errors and actual layout issues.
const LAYOUT_TOLERANCE = 2 * EPS

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function validateBandPartition(panels: Panel[], issues: Issue[]): void {
  // Sweep-line by Y; for each vertical band, panels that cover that band should partition [0,1]
  const edges = new Set<number>()
  for (const p of panels) {
    edges.add(clamp01(p.position.y))
    edges.add(clamp01(p.position.y + p.size.height))
  }
  const ys = Array.from(edges).sort((a, b) => a - b)
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    const bandHeight = y1 - y0
    if (bandHeight <= EPS) continue
    // Panels that fully span this band
    const bandPanels = panels.filter(
      (p) => p.position.y <= y0 + EPS && p.position.y + p.size.height >= y1 - EPS,
    )
    if (bandPanels.length === 0) continue

    // Get panel IDs for debugging context
    const bandPanelIds = bandPanels.map((p) => String(p.id)).join(', ')

    const segs = bandPanels
      .map((p) => ({
        x: clamp01(p.position.x),
        w: clamp01(p.size.width),
        id: p.id,
      }))
      .sort((a, b) => a.x - b.x)
    // Check coverage from 0 to 1 with minimal gaps/overlaps
    let cursor = 0
    let encountered = false
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j]
      if (j === 0 && Math.abs(s.x - 0) > LAYOUT_TOLERANCE) {
        issues.push(
          `horizontal gap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): starts at ${s.x} (panels: ${bandPanelIds})`,
        )
        encountered = true
      }
      if (s.x - cursor > LAYOUT_TOLERANCE) {
        issues.push(
          `horizontal gap before segment at y=[${y0.toFixed(2)},${y1.toFixed(2)}): gap=${(s.x - cursor).toFixed(3)} (panels: ${bandPanelIds})`,
        )
        encountered = true
      }
      if (cursor - s.x > LAYOUT_TOLERANCE) {
        issues.push(
          `horizontal overlap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): overlap=${(cursor - s.x).toFixed(3)} (affected panel: ${String(s.id)}, band panels: ${bandPanelIds})`,
        )
        encountered = true
      }
      cursor = Math.max(cursor, s.x) + s.w
    }
    const coverageNotOne = Math.abs(cursor - 1) > LAYOUT_TOLERANCE
    if (coverageNotOne || encountered) {
      const detail = coverageNotOne ? `sum=${cursor.toFixed(3)}` : 'gaps/overlaps present'
      issues.push(
        `horizontal coverage != 1 at y=[${y0.toFixed(2)},${y1.toFixed(2)}): ${detail} (panels: ${bandPanelIds})`,
      )
    }
  }
}

export function validatePanels(panels: Panel[]): ValidationResult {
  const issues: Issue[] = []
  for (const p of panels) {
    const x2 = p.position.x + p.size.width
    const y2 = p.position.y + p.size.height
    if (p.size.width <= 0 || p.size.height <= 0) {
      issues.push(`non-positive size for panel ${String(p.id)}`)
    }
    if (p.position.x < -EPS || p.position.x > 1 + EPS) {
      issues.push(`x out of bounds for panel ${String(p.id)}: ${p.position.x}`)
    }
    if (p.position.y < -EPS || p.position.y > 1 + EPS) {
      issues.push(`y out of bounds for panel ${String(p.id)}: ${p.position.y}`)
    }
    if (x2 > 1 + EPS) issues.push(`x+width > 1 for panel ${String(p.id)}: ${x2}`)
    if (y2 > 1 + EPS) issues.push(`y+height > 1 for panel ${String(p.id)}: ${y2}`)
  }
  // Overlaps: spatial hashing grid to reduce comparisons from O(n^2)
  type Aug = {
    id: Panel['id']
    x1: number
    x2: number
    y1: number
    y2: number
  }
  const rects: Aug[] = panels.map((p) => ({
    id: p.id,
    x1: p.position.x,
    x2: p.position.x + p.size.width,
    y1: p.position.y,
    y2: p.position.y + p.size.height,
  }))
  const GRID = 8 // 8x8 grid
  const cellPairs = new Map<string, Aug[]>()
  const clampIdx = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(v * GRID)))
  for (const r of rects) {
    const cx1 = clampIdx(r.x1)
    const cx2 = clampIdx(Math.max(0, Math.min(0.999999, r.x2)))
    const cy1 = clampIdx(r.y1)
    const cy2 = clampIdx(Math.max(0, Math.min(0.999999, r.y2)))
    for (let cy = cy1; cy <= cy2; cy++) {
      for (let cx = cx1; cx <= cx2; cx++) {
        const key = `${cx},${cy}`
        const arr = cellPairs.get(key)
        if (arr) arr.push(r)
        else cellPairs.set(key, [r])
      }
    }
  }
  const seen = new Set<string>()
  Array.from(cellPairs.values()).forEach((arr) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]
        const b = arr[j]
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
        if (overlapX > EPS && overlapY > EPS) {
          issues.push(`panels overlap: ${String(a.id)} and ${String(b.id)}`)
        }
      }
    }
  })

  // Partition check by vertical bands
  validateBandPartition(panels, issues)

  return { valid: issues.length === 0, issues }
}

function readingOrderComparator(a: Panel, b: Panel): number {
  // Japanese reading order: top-to-bottom; within band, right-to-left
  const dy = a.position.y - b.position.y
  if (Math.abs(dy) > 0.05) return dy
  return b.position.x - a.position.x
}

/**
 * Optimized panel mapping with optional sorting
 * For performance, only sort when panel counts differ
 */
function mapPanelsToTemplate(source: Panel[], template: Panel[]): Panel[] {
  // OPTIMIZATION: Skip sorting when panel counts match exactly
  // Assume same reading order when counts are equal
  if (source.length === template.length) {
    return source.map((s, i) => ({
      id: s.id,
      content: s.content,
      dialogues: s.dialogues,
      sourceChunkIndex: s.sourceChunkIndex,
      importance: s.importance,
      position: { x: template[i].position.x, y: template[i].position.y },
      size: { width: template[i].size.width, height: template[i].size.height },
    }))
  }

  // Only sort when counts differ (need proper alignment)
  const srcSorted = [...source].sort(readingOrderComparator)
  const tplSorted = [...template].sort(readingOrderComparator)
  const count = Math.min(srcSorted.length, tplSorted.length)
  const mapped: Panel[] = []
  for (let i = 0; i < count; i++) {
    const s = srcSorted[i]
    const t = tplSorted[i]
    mapped.push({
      id: s.id,
      content: s.content,
      dialogues: s.dialogues,
      sourceChunkIndex: s.sourceChunkIndex,
      importance: s.importance,
      position: { x: t.position.x, y: t.position.y },
      size: { width: t.size.width, height: t.size.height },
    })
  }
  return mapped
}

type RefPage = { page_number: number; panels: Panel[] }

function loadReferencePages(): RefPage[] {
  // Use embedded references for Workers compatibility
  return embeddedReferencePages
}

function _distancePanels(a: Panel[], b: Panel[]): number {
  // If counts differ, penalize heavily
  if (a.length !== b.length) return Math.abs(a.length - b.length) * 10
  const sa = [...a].sort(readingOrderComparator)
  const sb = [...b].sort(readingOrderComparator)
  let d = 0
  for (let i = 0; i < sa.length; i++) {
    const pa = sa[i]
    const pb = sb[i]
    d += Math.abs(pa.position.x - pb.position.x)
    d += Math.abs(pa.position.y - pb.position.y)
    d += Math.abs(pa.size.width - pb.size.width)
    d += Math.abs(pa.size.height - pb.size.height)
  }
  return d
}

/**
 * Lightweight reference selection using simple heuristics instead of expensive distance calculation
 */
function selectBestReferenceLight(panels: Panel[], candidates: RefPage[]): RefPage {
  const panelCount = panels.length

  // Strategy 1: Prefer exact panel count matches
  const exactMatches = candidates.filter((c) => c.panels.length === panelCount)
  if (exactMatches.length === 1) {
    return exactMatches[0]
  }

  // Strategy 2: For multiple exact matches, prefer lower page numbers (simpler layouts first)
  if (exactMatches.length > 1) {
    return exactMatches.reduce((best, current) =>
      current.page_number < best.page_number ? current : best,
    )
  }

  // Strategy 3: If no exact matches, find the closest panel count
  const closestCount = candidates.reduce((closest, current) => {
    const currentDiff = Math.abs(current.panels.length - panelCount)
    const closestDiff = Math.abs(closest.panels.length - panelCount)
    return currentDiff < closestDiff ? current : closest
  })

  return closestCount
}

export function applyReferenceFallback(page: { panels: Panel[] }): {
  panels: Panel[]
  meta?: { referencePage?: number; score?: number }
} {
  const refs = loadReferencePages()

  if (refs.length === 0) {
    console.warn('applyReferenceFallback: No reference pages available, returning original panels')
    return { panels: page.panels }
  }

  const candidates = refs.filter((rp) => Array.isArray(rp.panels) && rp.panels.length >= 1)
  if (candidates.length === 0) {
    console.warn(
      'applyReferenceFallback: No valid reference candidates found, returning original panels',
    )
    return { panels: page.panels }
  }

  const panelCount = page.panels.length
  const panelIds = page.panels.map((p) => p.id).join(', ')
  console.log(
    `applyReferenceFallback: Attempting fallback for panels [${panelIds}] with ${candidates.length} reference candidates`,
  )

  // OPTIMIZATION: Use lightweight selection instead of expensive distance calculation
  const best = selectBestReferenceLight(page.panels, candidates)
  const score = best.panels.length === panelCount ? 1.0 : Math.abs(best.panels.length - panelCount)

  console.log(
    `applyReferenceFallback: Using reference page ${best.page_number} with score ${score.toFixed(3)}`,
  )

  try {
    const mapped = mapPanelsToTemplate(page.panels, best.panels)
    console.log(
      `applyReferenceFallback: Successfully mapped ${page.panels.length} panels to ${best.panels.length} template panels`,
    )
    return {
      panels: mapped,
      meta: { referencePage: best.page_number, score },
    }
  } catch (error) {
    console.error('applyReferenceFallback: Error during panel mapping:', error)
    return { panels: page.panels }
  }
}

export function normalizeAndValidateLayout(
  layout: MangaLayout,
  options?: { allowFallback?: boolean; verboseIssues?: boolean },
): {
  layout: MangaLayout
  pageIssues: Record<number, Issue[]>
} {
  const pageIssues: Record<number, Issue[]> = {}
  const normalizedPages = layout.pages.map((p) => {
    const clampedPanels = p.panels.map((panel) => {
      const x = clamp01(panel.position.x)
      const y = clamp01(panel.position.y)
      let w = clamp01(panel.size.width)
      let h = clamp01(panel.size.height)
      if (x + w > 1) w = Math.max(0, 1 - x)
      if (y + h > 1) h = Math.max(0, 1 - y)
      const out: Panel = {
        ...panel,
        position: { x, y },
        size: { width: w, height: h },
      }
      return out
    })
    const v1 = validatePanels(clampedPanels)
    if (!v1.valid) {
      const allowFallback = options?.allowFallback !== false // default allow
      const verbose = options?.verboseIssues === true
      if (!allowFallback) {
        // フォールバック禁止: 問題を記録してそのまま返す
        pageIssues[p.page_number] = v1.issues
        return { page_number: p.page_number, panels: clampedPanels }
      }
      const result = applyReferenceFallback({ panels: clampedPanels })
      const mapped = result.panels
      const v2 = validatePanels(mapped)
      if (!v2.valid) {
        // 依然として無効。最終状態の問題を提示（verbose時はフォールバック情報も）
        pageIssues[p.page_number] = verbose
          ? [
              `fallback_applied_but_invalid${result.meta?.referencePage ? ` (reference_page=${result.meta.referencePage})` : ''}`,
              ...v2.issues,
            ]
          : v2.issues
      } else {
        // 有効化された場合: 既定では空配列（テスト互換）。verbose時のみメタを残す。
        if (verbose) {
          const meta = result.meta
          const refInfo = meta?.referencePage
            ? `reference_page=${meta.referencePage}`
            : 'reference_page=unknown'
          pageIssues[p.page_number] = [`fallback_applied: ${refInfo}`]
        } else {
          pageIssues[p.page_number] = []
        }
      }
      return { page_number: p.page_number, panels: mapped }
    }
    return { page_number: p.page_number, panels: clampedPanels }
  })

  return {
    layout: {
      ...layout,
      pages: normalizedPages,
    },
    pageIssues,
  }
}
