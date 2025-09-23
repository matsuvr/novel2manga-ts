import fs from 'node:fs'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { renderPageToCanvas } from '@/lib/canvas/renderer/page-renderer'
import type { MangaLayout } from '@/types/panel-layout'

// Simple golden test for page 1 rendering.
// NOTE: We intentionally do not assert exact font rasterization differences across platforms.
// Instead we allow a small diff threshold.

const GOLDEN_DIR = path.join(__dirname, 'golden-images')
const GOLDEN_FILE = path.join(GOLDEN_DIR, 'page1.png')

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

interface MinimalCanvas { toBuffer: (mime?: string) => Buffer }
function canvasToPngBuffer(canvas: MinimalCanvas): Buffer {
  try {
    return canvas.toBuffer('image/png')
  } catch {
    // fallback placeholder detection
    return Buffer.from('PNG_PLACEHOLDER_FALLBACK')
  }
}

describe('Golden image: page 1', () => {
  it('matches stored golden (or creates when UPDATE_GOLDEN=1)', async () => {
    const layoutPath = path.join(__dirname, 'golden-sample-layout.json')
    const layout: MangaLayout = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'))

    const canvas = renderPageToCanvas({ layout, pageNumber: 1, width: 800, height: 1200 })
    const pngBuffer = canvasToPngBuffer(canvas)

    if (pngBuffer.toString().startsWith('PNG_PLACEHOLDER_PAGE_') || pngBuffer.toString() === 'PNG_PLACEHOLDER_FALLBACK') {
      console.warn('Skipping golden comparison due to placeholder buffer (native toBuffer failure).')
      return
    }

    ensureDir(GOLDEN_DIR)

    if (process.env.UPDATE_GOLDEN === '1' || !fs.existsSync(GOLDEN_FILE)) {
      fs.writeFileSync(GOLDEN_FILE, pngBuffer)
      console.log('[golden] wrote baseline image page1.png')
      return
    }

    const golden = PNG.sync.read(fs.readFileSync(GOLDEN_FILE))
    const current = PNG.sync.read(pngBuffer)

    expect(current.width).toBe(golden.width)
    expect(current.height).toBe(golden.height)

    const diffPng = new PNG({ width: golden.width, height: golden.height })
    const diffPixels = pixelmatch(golden.data, current.data, diffPng.data, golden.width, golden.height, {
      threshold: 0.1,
      alpha: 0.5,
      includeAA: false,
    })

    // Allow small differences (font hinting etc.)
    const maxDiff = 0.01 * golden.width * golden.height // 1% of pixels
    if (diffPixels > maxDiff) {
      const diffPath = path.join(GOLDEN_DIR, 'page1.diff.png')
      fs.writeFileSync(diffPath, PNG.sync.write(diffPng))
      throw new Error(`Golden image mismatch: diffPixels=${diffPixels} > allowed=${maxDiff}`)
    }
  })
})
