import { getRandomPanelLayout } from '@/data/panel-layout-samples'
import type { LayoutTemplate } from '@/types/panel-layout'

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

// bbox形式からposition/size形式に変換
function bboxToPositionSize(bbox: [number, number, number, number]): {
  position: { x: number; y: number }
  size: { width: number; height: number }
} {
  const [x, y, w, h] = bbox
  return {
    position: { x, y },
    size: { width: w, height: h },
  }
}

function buildEmbeddedSamples(): Map<number, LayoutTemplate[]> {
  const map = new Map<number, LayoutTemplate[]>()

  // From panel-layout-samples (public/docs/panel_layout_sample/*.json)
  try {
    for (let count = 1; count <= 6; count++) {
      const templates: LayoutTemplate[] = []

      // 各パネル数に対して複数のサンプルを試行
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const layout = getRandomPanelLayout(count)
          const panels = layout.panels.map((p) => bboxToPositionSize(p.bbox))
          templates.push(templateFromPanels(`sample-${count}-${attempt}`, panels))
        } catch {
          // 特定のサンプルが見つからない場合は次の試行へ
          break
        }
      }

      if (templates.length > 0) {
        map.set(count, templates)
      }
    }
  } catch (e) {
    console.warn('Failed to load panel layout samples:', e)
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
