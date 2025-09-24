import { describe, expect, it, vi } from 'vitest'
import { ensureDialogueAssets } from '@/lib/canvas/assets/dialogue-batcher'
import { getDialogueAsset } from '@/lib/canvas/assets/dialogue-cache'

// failure injection: first large batch fails, halves succeed, one single fails → placeholder
let callCount = 0
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalTextBatch: vi.fn(async ({ items }: any) => {
    callCount++
    // Force failure on first call if batch size > 3
    if (callCount === 1 && items.length > 3) {
      throw new Error('Injected failure for large batch')
    }
    // Fail when text === 'X_FAIL_SINGLE' to test placeholder path
    if (items.length === 1 && items[0].text === 'X_FAIL_SINGLE') {
      throw new Error('Injected single failure')
    }
    return items.map((it: any, idx: number) => ({
      pngBuffer: Buffer.from(`IMG_${idx}_${it.text}`),
      meta: {
        image_base64: 'VT_PLACEHOLDER',
        width: 12,
        height: 12,
        trimmed: true,
        content_bounds: { x: 0, y: 0, width: 12, height: 12 },
      },
    }))
  }),
}))

vi.mock('@/lib/canvas/core/canvas-init', () => ({
  ensureCanvasInited: () => {},
  createCanvas: (w: number, h: number) => ({ width: w, height: h, getContext: () => ({}) }),
  loadImage: async () => ({ width: 12, height: 12 }),
}))

vi.mock('@/lib/canvas/assets/dialogue-cache', async (orig) => {
  const actual: any = await orig()
  return {
    ...actual,
    getDialogueAsset: (k: string) => actual.__cache?.get(k),
    setDialogueAsset: (k: string, v: any) => { if (!actual.__cache) actual.__cache = new Map(); actual.__cache.set(k, v) },
  }
})

describe('dialogue-batcher recovery', () => {
  it('recovers by splitting and uses placeholder for unrecoverable single', async () => {
    const reqs = [
      'A','B','C','D','X_FAIL_SINGLE'
    ].map(t => ({
      key: 'k_'+t,
      text: t,
      style: 'normal',
      fontSize: 14,
      lineHeight: 18,
      letterSpacing: 0,
      padding: 4,
    }))
    await ensureDialogueAssets(reqs)
    // All keys should now have an asset (placeholder or real)
    for (const r of reqs) {
      const asset = getDialogueAsset(r.key)
      expect(asset).toBeTruthy()
    }
  })
})
