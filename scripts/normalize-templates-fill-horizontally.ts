/*
  目的: テンプレートの各「垂直バンド」内で横方向を [0,1] に完全分割する。
  - 余白(0.05/0.9等)を除去し、読み取りやすい検証に通るよう修正
  - 同一バンド内では元の幅比率を維持（sum(width_i) で正規化）
  - 出力は元ファイルを書き換え（上書き）
*/
import fs from 'node:fs'
import path from 'node:path'

type Panel = { id: number | string; bbox: [number, number, number, number]; [k: string]: unknown }
type Page = { panels_count: number; panels: Panel[] }

const ROOT = path.resolve('public/docs/panel_layout_sample')
const EPS = 1e-6

function listJsonFiles(dir: string): string[] {
  const out: string[] = []
  function walk(d: string) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (p.endsWith('.json')) out.push(p)
    }
  }
  walk(dir)
  return out
}

function loadPage(file: string): { key: string; page: Page } | null {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Page>
  const key = Object.keys(obj)[0]
  if (!key) return null
  return { key, page: obj[key] }
}

function isOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > EPS
}

function normalizePage(page: Page): Page {
  // バンド分割: y 区間が重なるものを同一バンドにする
  const panels = page.panels.slice()
  type Band = { idxs: number[]; y0: number; y1: number }
  const bands: Band[] = []

  for (let i = 0; i < panels.length; i++) {
    const [, y, , h] = panels[i].bbox
    const y0 = y
    const y1 = y + h
    let placed = false
    for (const b of bands) {
      if (isOverlap(b.y0, b.y1, y0, y1)) {
        b.idxs.push(i)
        b.y0 = Math.min(b.y0, y0)
        b.y1 = Math.max(b.y1, y1)
        placed = true
        break
      }
    }
    if (!placed) bands.push({ idxs: [i], y0, y1 })
  }

  // 各バンドを横方向で [0,1] 分割（比率維持）
  for (const b of bands) {
    const idxs = b.idxs.sort((i, j) => panels[i].bbox[0] - panels[j].bbox[0])
    const widths = idxs.map((i) => panels[i].bbox[2])
    const sum = widths.reduce((a, c) => a + c, 0)
    if (sum <= EPS) continue
    let cursor = 0
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k]
      const p = panels[i]
      const ratio = widths[k] / sum
      const newW = Math.max(0, Math.min(1, ratio))
      const newX = cursor
      cursor += newW
      p.bbox = [
        Number(newX.toFixed(6)),
        Number(p.bbox[1].toFixed(6)),
        Number(newW.toFixed(6)),
        Number(p.bbox[3].toFixed(6)),
      ]
    }
    // 累積誤差を最後のパネルに寄せて幅合計=1に合わせる
    const lastIdx = idxs[idxs.length - 1]
    const firstX = panels[idxs[0]].bbox[0]
    const lastX = panels[lastIdx].bbox[0]
    const lastW = panels[lastIdx].bbox[2]
    const end = Number((lastX + lastW).toFixed(6))
    const diff = 1 - end
    if (Math.abs(diff) > 1e-6) {
      panels[lastIdx].bbox = [
        panels[lastIdx].bbox[0],
        panels[lastIdx].bbox[1],
        Number((lastW + diff).toFixed(6)),
        panels[lastIdx].bbox[3],
      ]
    }
    // 先頭が0でない場合も0に寄せる（誤差吸収）
    if (firstX !== 0) {
      const shift = firstX
      for (const i of idxs) {
        panels[i].bbox = [
          Number((panels[i].bbox[0] - shift).toFixed(6)),
          panels[i].bbox[1],
          panels[i].bbox[2],
          panels[i].bbox[3],
        ]
      }
    }
  }

  return { panels_count: page.panels_count, panels }
}

function savePage(file: string, key: string, page: Page) {
  const obj: Record<string, Page> = { [key]: page }
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
}

function main() {
  const files = listJsonFiles(ROOT)
  for (const f of files) {
    const loaded = loadPage(f)
    if (!loaded) continue
    const normalized = normalizePage(loaded.page)
    savePage(f, loaded.key, normalized)
    // eslint-disable-next-line no-console
    console.log('normalized', path.relative(process.cwd(), f))
  }
}

main()
