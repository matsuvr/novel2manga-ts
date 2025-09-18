import fs from 'node:fs'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { CanvasRenderer, type DialogueAsset } from '../src/lib/canvas/canvas-renderer'
import { collectDialogueRequests } from '../src/lib/canvas/dialogue-asset-builder'
import type { MangaLayout } from '../src/types/panel-layout'
import { getFontForDialogue } from '../src/types/vertical-text'
import { applyTemplatesByPanelCount } from '../src/utils/layout-template-applier'

async function main() {
  const layoutPath = path.resolve(process.cwd(), '.local-storage/layouts/82fe3979-699c-4faa-99bd-7c3e6d9fa412/jobs/62df327b-d730-444d-bf6c-e78e594d1dd3/layouts/episode_1.json')
  if (!fs.existsSync(layoutPath)) {
    console.error('layout json not found:', layoutPath)
    process.exit(1)
  }
  const raw = fs.readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(raw) as MangaLayout
  if (!layout.pages || layout.pages.length === 0) {
    console.error('no pages in layout')
    process.exit(1)
  }
  // Apply template (with vertical normalization) to a single page clone
  const templated = applyTemplatesByPanelCount({ ...layout, pages: [layout.pages[0]] })
  const pageLayout = templated

  // CanvasRenderer.create is async in case of future async setup
  const renderer = await CanvasRenderer.create({ width: 1200, height: 1800 })
  // Prepare simple test placeholder assets for dialogues so renderer can draw bubbles
  const computeMaxCharsPerLine = (panelHeightRatio: number) => {
    if (panelHeightRatio <= 0.2) return 6
    if (panelHeightRatio <= 0.3) return 8
    return 14
  }
  const extractDialogueText = (t: string) => t

  const pageForAssets = pageLayout.pages[0]
  // Adapter: collectDialogueRequests expects a looser Dialogue shape where speaker may be undefined.
  type FontArg = { speaker: string; text: string; type?: 'speech' | 'thought' | 'narration'; emotion?: string }
  const fontSelector = (d: { text: string; speaker?: string; emotion?: string; type?: 'speech' | 'thought' | 'narration' | undefined }) =>
    getFontForDialogue({ speaker: (d.speaker as string) ?? 'ナレーション', text: d.text, type: d.type, emotion: d.emotion } as FontArg)
  const collected = collectDialogueRequests(pageForAssets, computeMaxCharsPerLine, extractDialogueText, fontSelector)

  const assetMap: Record<string, DialogueAsset> = {}
  for (const entry of collected.map) {
    const fontSize = 24
    const padding = 12
    const w = Math.max(64, Math.min(800, Math.ceil(entry.text.length * (fontSize * 0.6)) + padding * 2))
    const h = Math.max(32, Math.ceil(entry.text.length / Math.max(1, entry.maxCharsPerLine)) * fontSize + padding * 2)
    const tmpCanvas = createCanvas(w, h)
    const ctx = tmpCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#000000'
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillText(entry.text, padding, padding + fontSize / 2)
    const buffer = tmpCanvas.toBuffer('image/png')
    const asset = await CanvasRenderer.createImageFromBuffer(buffer)
    assetMap[entry.key] = asset
  }

  renderer.setDialogueAssets(assetMap)

  renderer.renderMangaLayout(pageLayout)

  // Use toBlob() which returns a Blob; convert to Buffer for writing to disk
  const blob = await renderer.toBlob('image/png')
  // Convert Blob -> ArrayBuffer -> Buffer
  const arrayBuffer = await blob.arrayBuffer()
  const out = Buffer.from(arrayBuffer)
  const outPath = path.resolve(process.cwd(), 'tmp', 'render_page1.png')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, out)
  console.log('wrote', outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
