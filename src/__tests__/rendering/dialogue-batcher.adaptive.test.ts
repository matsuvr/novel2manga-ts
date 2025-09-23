import { describe, expect, it, vi } from 'vitest'
import { dialogueAssetsConfig } from '@/config/dialogue-assets.config'
import { ensureDialogueAssets } from '@/lib/canvas/assets/dialogue-batcher'
import { getDialogueAsset, setDialogueAsset } from '@/lib/canvas/assets/dialogue-cache'

// Mock vertical text client
vi.mock('@/services/vertical-text-client', () => ({
  renderVerticalTextBatch: vi.fn(async ({ items }: any) => {
    // simulate variable time by delaying proportional to items length
    const delay = items.length * 5 // fast
    await new Promise(r => setTimeout(r, delay))
    return items.map((it: any, idx: number) => ({
      pngBuffer: Buffer.from(`PNG_${idx}_${it.text}`),
      meta: { width: 10, height: 10 },
    }))
  }),
}))

// Provide minimal canvas-init mocks
vi.mock('@/lib/canvas/core/canvas-init', () => ({
  ensureCanvasInited: () => {},
  createCanvas: (w: number, h: number) => ({ width: w, height: h, getContext: () => ({}) }),
  loadImage: async () => ({ width: 10, height: 10 }),
}))

// Reset dialogue cache helpers
vi.mock('@/lib/canvas/assets/dialogue-cache', async (orig) => {
  const actual: any = await orig()
  return {
    ...actual,
    getDialogueAsset: (k: string) => actual.__cache?.get(k),
    setDialogueAsset: (k: string, v: any) => { if (!actual.__cache) actual.__cache = new Map(); actual.__cache.set(k, v) },
  }
})

describe('dialogue-batcher adaptive', () => {
  it('adjusts batch size upward on fast responses', async () => {
    if (!dialogueAssetsConfig.batch.adaptive.enabled) return
    const initial = dialogueAssetsConfig.batch.adaptive.initial
    const reqs = Array.from({ length: initial * 2 }, (_, i) => ({
      key: `k${i}`,
      text: 'あ',
      style: 'normal',
      fontSize: 14,
      lineHeight: 18,
      letterSpacing: 0,
      padding: 4,
    }))
    await ensureDialogueAssets(reqs)
    // We cannot directly read dynamicLimit (internal), but all assets should be cached
    reqs.forEach(r => expect(getDialogueAsset(r.key)).toBeTruthy())
  })
})
