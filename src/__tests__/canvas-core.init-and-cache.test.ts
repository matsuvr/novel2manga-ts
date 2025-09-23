import { describe, expect, it } from 'vitest'
import { clearDialogueCache, dialogueCacheSize, getDialogueAsset, setDialogueAsset } from '@/lib/canvas/assets/dialogue-cache'
import { ensureCanvasInited } from '@/lib/canvas/core/canvas-init'

// Minimal mock for CanvasImageSource like object
const img = { width: 10, height: 20 } as unknown as CanvasImageSource

describe('canvas-core ensureCanvasInited', () => {
  it('is idempotent (second call does not throw)', () => {
    ensureCanvasInited()
    expect(() => ensureCanvasInited()).not.toThrow()
  })
})

describe('dialogue-cache basic operations', () => {
  it('stores and retrieves asset', () => {
    clearDialogueCache()
    expect(dialogueCacheSize()).toBe(0)
    setDialogueAsset('k1', { image: img, width: 10, height: 20 })
    expect(dialogueCacheSize()).toBe(1)
    const a = getDialogueAsset('k1')
    expect(a?.width).toBe(10)
    expect(a?.height).toBe(20)
  })
})
