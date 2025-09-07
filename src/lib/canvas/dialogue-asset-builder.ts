import { dialogueAssetsConfig } from '@/config/dialogue-assets.config'
import type { Page } from '@/types/panel-layout'
import type { VerticalTextRenderRequest } from '@/types/vertical-text'
import type { DialogueAsset } from './canvas-renderer'

export interface DialogueRequestMapEntry {
  key: string
  panelId: string | number
  dialogueIndex: number
  text: string
  maxCharsPerLine: number
}

export interface CollectDialogueResult {
  items: VerticalTextRenderRequest[]
  map: DialogueRequestMapEntry[]
  totalDialogues: number
}

/**
 * ページ内の全 dialogue を走査し、API リクエスト項目と対応マップを構築（純粋関数）
 */
export function collectDialogueRequests(
  page: Page,
  computeMaxCharsPerLine: (panelHeightRatio: number) => number,
  extractDialogueText: (text: string) => string,
  getFontForDialogue: (d: {
    text: string
    speaker?: string
    emotion?: string
    type?: 'speech' | 'thought' | 'narration' | undefined
  }) => 'gothic' | 'mincho' | undefined,
): CollectDialogueResult {
  const items: VerticalTextRenderRequest[] = []
  const map: DialogueRequestMapEntry[] = []
  let totalDialogues = 0

  for (const panel of page.panels) {
    const dialogues = panel.dialogues || []
    totalDialogues += dialogues.length
    const panelHeightRatio = panel.size.height
    const maxCharsForPanel = computeMaxCharsPerLine(panelHeightRatio)
    for (let i = 0; i < dialogues.length; i++) {
      const d = dialogues[i]
      const cleanedText = extractDialogueText(d.text)
      const selectedFont = getFontForDialogue(d) ?? 'gothic'
      items.push({
        text: cleanedText,
        font: selectedFont,
        maxCharsPerLine: maxCharsForPanel,
      })
      map.push({
        key: `${panel.id}:${i}`,
        panelId: panel.id,
        dialogueIndex: i,
        text: cleanedText,
        maxCharsPerLine: maxCharsForPanel,
      })
    }
  }

  return { items, map, totalDialogues }
}

/**
 * テスト環境用: ネットワーク/API 呼び出しを行わずに DialogueAsset を組み立てる（純粋関数）
 */
export function buildTestPlaceholderAssets(
  map: DialogueRequestMapEntry[],
  defaults: {
    fontSize: number
    padding: number
  },
): Record<string, DialogueAsset> {
  const assets: Record<string, DialogueAsset> = {}
  for (const entry of map) {
    const w = defaults.fontSize + defaults.padding * 2
    const h = Math.max(
      dialogueAssetsConfig.testPlaceholder.minHeight,
      Math.ceil(entry.text.length * (defaults.fontSize * 0.9)),
    )
    // ImageData 互換オブジェクトで CanvasImageSource をモック
    const img = {
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
      colorSpace: 'srgb' as PredefinedColorSpace,
    } as ImageData
    // テスト専用のプレースホルダーであり drawImage は呼ばれない前提
    assets[entry.key] = { image: img as unknown as CanvasImageSource, width: w, height: h }
  }
  return assets
}

/**
 * バッチAPI結果(pngBuffer→CanvasImageSource 変換後) から DialogueAsset を構築
 * ここでは side-effect を避けるためバッファ→画像変換後の画像と meta 幅高さを受け取る
 */
export function buildAssetsFromImages(
  map: DialogueRequestMapEntry[],
  images: Array<{ key: string; image: CanvasImageSource; meta: { width: number; height: number } }>,
): Record<string, DialogueAsset> {
  const assets: Record<string, DialogueAsset> = {}
  for (const img of images) {
    const width = Math.max(1, img.meta.width)
    const height = Math.max(1, img.meta.height)
    assets[img.key] = { image: img.image, width, height }
  }
  // map の key で欠損が無いか検証（純粋）
  for (const entry of map) {
    if (!assets[entry.key]) {
      throw new Error(`Missing asset for key ${entry.key}`)
    }
  }
  return assets
}
