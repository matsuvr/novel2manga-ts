import type { VerticalTextBounds } from '@/types/vertical-text'

// Simple in-memory cache (future: optional persistent layer)
export interface DialogueImageAsset {
  width: number
  height: number
  image: CanvasImageSource
  contentBounds?: VerticalTextBounds
}

const mem = new Map<string, DialogueImageAsset>()

export function getDialogueAsset(key: string): DialogueImageAsset | undefined {
  return mem.get(key)
}
export function setDialogueAsset(key: string, asset: DialogueImageAsset): void {
  mem.set(key, asset)
}
export function ensureDialogueAssetsBulk(entries: Array<[string, DialogueImageAsset]>): void {
  for (const [k, v] of entries) if (!mem.has(k)) mem.set(k, v)
}
export function clearDialogueCache(): void { mem.clear() }
export function dialogueCacheSize(): number { return mem.size }
