import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appConfig } from '@/config/app.config'
import { clearDialogueCache, setDialogueAsset } from '@/lib/canvas/assets/dialogue-cache'
import { buildDialogueKey } from '@/lib/canvas/assets/dialogue-key'
import { renderPageToCanvas } from '@/lib/canvas/renderer/page-renderer'
import type { MangaLayout } from '@/types/panel-layout'

// Mock canvas creation (use a very small canvas substitute)
class MockCtx {
  font = ''
  fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000'
  lineWidth = 1
  calls: string[] = []
  clearRect() {}
  setTransform() {}
  beginPath() { this.calls.push('beginPath') }
  rect(x: number, y: number, w: number, h: number) { this.calls.push(`rect:${x},${y},${w},${h}`) }
  strokeRect(x: number, y: number, w: number, h: number) { this.calls.push(`strokeRect:${x},${y},${w},${h}`) }
  fillRect(x: number, y: number, w: number, h: number) { this.calls.push(`fillRect:${x},${y},${w},${h}`) }
  fill() { this.calls.push('fill') }
  stroke() { this.calls.push('stroke') }
  measureText(t: string): TextMetrics { return { width: t.length * 10 } as TextMetrics }
  fillText(t: string, x: number, y: number) { this.calls.push(`fillText:${t}@${x},${y}`) }
  strokeText(t: string, x: number, y: number) { this.calls.push(`strokeText:${t}@${x},${y}`) }
  drawImage(_img: unknown, x: number, y: number, w: number, h: number) { this.calls.push(`drawImage@${x},${y},${w},${h}`) }
  translate() {}
  rotate() {}
}
class MockCanvas {
  width: number
  height: number
  ctx: MockCtx
  constructor(w: number, h: number) { this.width = w; this.height = h; this.ctx = new MockCtx() }
  getContext(type: '2d'): CanvasRenderingContext2D | null { return type === '2d' ? (this.ctx as unknown as CanvasRenderingContext2D) : null }
  toBuffer(): Buffer { return Buffer.from('PNG') }
}

vi.mock('@napi-rs/canvas', () => ({
  createCanvas: (w: number, h: number) => new MockCanvas(w, h),
  GlobalFonts: { register: () => {} },
}))

function makeLayout(dialogues: string[]): MangaLayout {
  return {
    pages: [
      { page_number: 1, panels: [ { position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, dialogues: dialogues.map(t => ({ text: t, type: 'speech' })), sfx: [] as any } ] },
    ],
  } as MangaLayout
}

describe('renderPageToCanvas vertical dialogue integration', () => {
  beforeEach(() => { clearDialogueCache() })

  it('uses image assets when present (no horizontal fillText for dialogues)', () => {
    const layout = makeLayout(['テスト縦書き'])
    // 事前にアセットを注入
    // appConfig の verticalText.defaults を利用して renderer 側と完全一致させる。
    // 以前はテスト内で lineHeight/padding を固定値(28/8)にしていたためキー不一致でアセット未ヒットとなり
    // drawImage が呼ばれなかった。キー生成パラメータは renderer と同一ソース(appConfig)に統一する。
    const vt = appConfig.rendering.verticalText.defaults
    const key = buildDialogueKey({
      dialogue: layout.pages[0].panels[0].dialogues![0] as any,
      fontSize: vt.fontSize,
      lineHeight: vt.lineHeight,
      letterSpacing: vt.letterSpacing,
      padding: vt.padding,
      maxCharsPerLine: vt.maxCharsPerLine,
    })
  // ダミーの CanvasImageSource: HTMLImageElement 互換 shape を最小で満たす
  const dummyImage = { width: 40, height: 120 } as unknown as CanvasImageSource
  setDialogueAsset(key, { image: dummyImage, width: 40, height: 120 })
    const canvas = renderPageToCanvas({ layout, pageNumber: 1, width: 400, height: 600 }) as unknown as MockCanvas
    const calls = canvas.ctx.calls
    const hasDrawImage = calls.some(c => c.startsWith('drawImage@'))
    const hasFillTextDialogue = calls.some(c => c.startsWith('fillText:テスト縦書き'))
    expect(hasDrawImage).toBe(true)
    expect(hasFillTextDialogue).toBe(false)
  })
})
