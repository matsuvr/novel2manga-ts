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

function rectsOverlap(a: Panel, b: Panel): boolean {
  const ax1 = a.position.x
  const ay1 = a.position.y
  const ax2 = a.position.x + a.size.width
  const ay2 = a.position.y + a.size.height
  const bx1 = b.position.x
  const by1 = b.position.y
  const bx2 = b.position.x + b.size.width
  const by2 = b.position.y + b.size.height
  const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1)
  const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1)
  return overlapX > EPS && overlapY > EPS
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
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j]
      if (j === 0 && Math.abs(s.x - 0) > 2 * EPS) {
        issues.push(`horizontal gap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): starts at ${s.x}`)
      }
      if (s.x - cursor > 2 * EPS) {
        issues.push(
          `horizontal gap before segment at y=[${y0.toFixed(2)},${y1.toFixed(2)}): gap=${(s.x - cursor).toFixed(3)}`,
        )
      }
      if (cursor - s.x > 2 * EPS) {
        issues.push(
          `horizontal overlap at y=[${y0.toFixed(2)},${y1.toFixed(2)}): overlap=${(cursor - s.x).toFixed(3)}`,
        )
      }
      cursor = Math.max(cursor, s.x) + s.w
    }
    if (Math.abs(cursor - 1) > 2 * EPS) {
      issues.push(
        `horizontal coverage != 1 at y=[${y0.toFixed(2)},${y1.toFixed(2)}): sum=${cursor.toFixed(3)}`,
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
  // Overlaps
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      if (rectsOverlap(panels[i], panels[j])) {
        issues.push(`panels overlap: ${String(panels[i].id)} and ${String(panels[j].id)}`)
      }
    }
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
    const { valid, issues } = validatePanels(clampedPanels)
    if (!valid) {
      pageIssues[p.page_number] = issues
      const mapped = applyReferenceFallback({ panels: clampedPanels })
      // Validate mapped; if still invalid, keep mapped anyway and record issues
      const v2 = validatePanels(mapped)
      if (!v2.valid) pageIssues[p.page_number] = issues.concat(v2.issues)
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
