/*
  テンプレート検証スクリプト
  - public/docs/panel_layout_sample/** 配下の JSON を走査
  - bbox を Panel に変換し、validatePanels を用いて重なり/範囲外/ギャップ等を検出
  - panels_count と実数の不一致、ゼロサイズも検出
  - 無効ファイルと理由を一覧表示（終了コード1）
*/

import fs from 'node:fs'
import path from 'node:path'
import { validatePanels } from '../src/utils/layout-normalizer'

type PanelLayout = {
  panels_count: number
  panels: Array<{
    id: number | string
    bbox: [number, number, number, number]
    content?: string
    dialogue?: string
  }>
}

function loadJsonFiles(rootDir: string): string[] {
  const out: string[] = []
  function walk(dir: string) {
    const ents = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of ents) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && p.endsWith('.json')) out.push(p)
    }
  }
  walk(rootDir)
  return out
}

function parsePanelLayout(jsonPath: string): PanelLayout | null {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>
  const keys = Object.keys(raw)
  if (keys.length !== 1) return null
  const pageObj = (raw as Record<string, PanelLayout>)[keys[0]]
  if (!pageObj || !Array.isArray(pageObj.panels)) return null
  return pageObj
}

function toPanels(page: PanelLayout) {
  return page.panels.map((p, i) => ({
    id: String(p.id ?? i + 1),
    position: { x: p.bbox[0], y: p.bbox[1] },
    size: { width: p.bbox[2], height: p.bbox[3] },
    content: '',
    dialogues: [],
    sourceChunkIndex: 0,
    importance: 5,
  }))
}

function main() {
  const root = path.resolve('public/docs/panel_layout_sample')
  const files = loadJsonFiles(root)
  const invalid: Array<{ file: string; reasons: string[] }> = []

  for (const f of files) {
    try {
      const page = parsePanelLayout(f)
      if (!page) {
        invalid.push({ file: f, reasons: ['invalid JSON structure (page_* missing or malformed)'] })
        continue
      }

      const reasons: string[] = []
      if (typeof page.panels_count === 'number' && page.panels_count !== page.panels.length) {
        reasons.push(
          `panels_count mismatch: declared=${page.panels_count}, actual=${page.panels.length}`,
        )
      }

      // basic zero-size / bounds checks
      for (const p of page.panels) {
        const [x, y, w, h] = p.bbox
        if (!(w > 0 && h > 0))
          reasons.push(`panel ${String(p.id)} has non-positive size (${w},${h})`)
        if (x < 0 || y < 0 || x + w > 1 || y + h > 1)
          reasons.push(`panel ${String(p.id)} out of bounds: [${x},${y},${w},${h}]`)
      }

      // advanced validation (overlap/partition) via validatePanels
      const panels = toPanels(page)
      const vr = validatePanels(panels)
      if (!vr.valid) {
        const filtered = vr.issues.filter((msg) => {
          const m = msg.toLowerCase()
          // テンプレート検証では余白起因の gap/coverage 警告は無視
          if (m.includes('gap') || m.includes('coverage')) return false
          return true
        })
        reasons.push(...filtered)
      }

      if (reasons.length > 0) invalid.push({ file: f, reasons: Array.from(new Set(reasons)) })
    } catch (e) {
      invalid.push({
        file: f,
        reasons: [`exception: ${e instanceof Error ? e.message : String(e)}`],
      })
    }
  }

  if (invalid.length === 0) {
    // eslint-disable-next-line no-console
    console.log('All templates are valid. files=', files.length)
    process.exit(0)
  }

  // eslint-disable-next-line no-console
  console.log('Invalid templates detected:', invalid.length)
  for (const item of invalid) {
    // eslint-disable-next-line no-console
    console.log(`\n- ${path.relative(process.cwd(), item.file)}\n  reasons:`)
    for (const r of item.reasons) {
      // eslint-disable-next-line no-console
      console.log(`    • ${r}`)
    }
  }
  process.exit(1)
}

main()
