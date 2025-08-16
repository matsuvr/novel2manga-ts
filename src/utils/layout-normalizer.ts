import type { MangaLayout, Panel } from '@/types/panel-layout'
import { referencePages as embeddedReferencePages } from '@/utils/reference-layouts'

type Issue = string

interface ValidationResult {
  valid: boolean
  issues: Issue[]
}

const EPS = 1e-3

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
    const segs = bandPanels
      .map((p) => ({ x: clamp01(p.position.x), w: clamp01(p.size.width) }))
      .sort((a, b) => a.x - b.x)
    // Check coverage from 0 to 1 with minimal gaps/overlaps
    let cursor = 0
    let encountered = false
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j]
      if (j === 0 && Math.abs(s.x - 0) > 2 * EPS) {
        issues.push(`horizontal gap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): starts at ${s.x}`)
        encountered = true
      }
      if (s.x - cursor > 2 * EPS) {
        issues.push(
          `horizontal gap before segment at y=[${y0.toFixed(2)},${y1.toFixed(2)}): gap=${(s.x - cursor).toFixed(3)}`,
        )
        encountered = true
      }
      if (cursor - s.x > 2 * EPS) {
        issues.push(
          `horizontal overlap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): overlap=${(cursor - s.x).toFixed(3)}`,
        )
        encountered = true
      }
      cursor = Math.max(cursor, s.x) + s.w
    }
    const coverageNotOne = Math.abs(cursor - 1) > 2 * EPS
    if (coverageNotOne || encountered) {
      const detail = coverageNotOne ? `sum=${cursor.toFixed(3)}` : 'gaps/overlaps present'
      issues.push(`horizontal coverage != 1 at y=[${y0.toFixed(2)},${y1.toFixed(2)}): ${detail}`)
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
  // Overlaps (sweep-line by X to avoid O(n^2) in common cases)
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
  rects.sort((a, b) => a.x1 - b.x1)
  const active: Aug[] = []
  for (const cur of rects) {
    // Remove intervals that end before the current starts (with tolerance)
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].x2 <= cur.x1 + EPS) active.splice(i, 1)
    }
    // Among active (which all have X-overlap with current), check Y-overlap
    for (const a of active) {
      const overlapX = Math.min(cur.x2, a.x2) - Math.max(cur.x1, a.x1)
      const overlapY = Math.min(cur.y2, a.y2) - Math.max(cur.y1, a.y1)
      if (overlapX > EPS && overlapY > EPS) {
        issues.push(`panels overlap: ${String(a.id)} and ${String(cur.id)}`)
      }
    }
    active.push(cur)
  }

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

function mapPanelsToTemplate(source: Panel[], template: Panel[]): Panel[] {
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
  // If template has fewer panels, drop extras; if more, ignore extras
  return mapped
}

type RefPage = { page_number: number; panels: Panel[] }

function loadReferencePages(): RefPage[] {
  // Use embedded references for Workers compatibility
  return embeddedReferencePages
}

function distancePanels(a: Panel[], b: Panel[]): number {
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

export function applyReferenceFallback(page: { panels: Panel[] }): Panel[] {
  const refs = loadReferencePages()
  if (refs.length === 0) return page.panels
  const candidates = refs.filter((rp) => Array.isArray(rp.panels) && rp.panels.length >= 1)
  if (candidates.length === 0) return page.panels
  let best = candidates[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    const score = distancePanels(page.panels, c.panels)
    if (score < bestScore) {
      best = c
      bestScore = score
    }
  }
  return mapPanelsToTemplate(page.panels, best.panels)
}

export function normalizeAndValidateLayout(layout: MangaLayout): {
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
      const mapped = applyReferenceFallback({ panels: clampedPanels })
      // Validate mapped; if still invalid, keep mapped anyway and record issues
      const v2 = validatePanels(mapped)
      // 最終状態のみを報告する: フォールバックで有効になった場合は空配列、
      // 依然として無効な場合は最終状態の問題のみを記録する。
      if (!v2.valid) {
        pageIssues[p.page_number] = v2.issues
      } else {
        // 正規化・修正が適用されて有効になったページを示すために空配列を入れる
        pageIssues[p.page_number] = []
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
