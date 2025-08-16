import type { LayoutTemplate } from '@/types/panel-layout'
import { referencePages } from '@/utils/reference-layouts'

// Cloudflare Workers-compatible embedded samples (no fs at runtime)

function templateFromPanels(
  name: string,
  panels: {
    position: { x: number; y: number }
    size: { width: number; height: number }
  }[],
): LayoutTemplate {
  return {
    name,
    description: `embedded pattern ${name}`,
    panelCount: panels.length,
    panels: panels.map((p, i) => ({
      position: p.position,
      size: p.size,
      priority: i + 1,
    })),
  }
}

function buildEmbeddedSamples(): Map<number, LayoutTemplate[]> {
  const map = new Map<number, LayoutTemplate[]>()
  // From referencePages (embedded patterns by count)
  for (const ref of referencePages) {
    const count = ref.panels.length
    const arr = map.get(count) || []
    arr.push(templateFromPanels(`ref-${count}`, ref.panels))
    map.set(count, arr)
  }
  // Deduplicate by geometry signature
  // Iterate via entries array to avoid requiring downlevelIteration/ES2015 target
  for (const [k, arr] of Array.from(map.entries())) {
    const seen = new Set<string>()
    const unique = arr.filter((t: LayoutTemplate) => {
      const sig = t.panels
        .map(
          (p: LayoutTemplate['panels'][number]) =>
            `${p.position.x}:${p.position.y}:${p.size.width}:${p.size.height}`,
        )
        .join('|')
      if (seen.has(sig)) return false
      seen.add(sig)
      return true
    })
    map.set(k, unique)
  }
  return map
}

const EMBEDDED = buildEmbeddedSamples()

export function loadSampleTemplatesByCount(count: number): LayoutTemplate[] {
  return EMBEDDED.get(count) || []
}

export function selectRandomTemplateByCount(
  count: number,
  fallback?: LayoutTemplate,
): LayoutTemplate | null {
  const list = loadSampleTemplatesByCount(count)
  if (list.length === 0) return fallback ?? null
  const idx = Math.floor(Math.random() * list.length)
  return list[idx] ?? fallback ?? null
}
