import { appConfig } from '@/config/app.config'
import { dialogueAssetsConfig } from '@/config/dialogue-assets.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { renderVerticalTextBatch } from '@/services/vertical-text-client'
import { createCanvas, ensureCanvasInited, loadImage } from '../core/canvas-init'
import { type DialogueImageAsset, getDialogueAsset, setDialogueAsset } from './dialogue-cache'

export interface DialogueBatchRequestItem {
  key: string
  text: string
  style: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  padding: number
  maxCharsPerLine?: number
  font?: 'antique' | 'gothic' | 'mincho'
}

export async function ensureDialogueAssets(requests: DialogueBatchRequestItem[]): Promise<void> {
  const missing = requests.filter(r => !getDialogueAsset(r.key))
  if (missing.length === 0) return
  const logger = getLogger().withContext({ service: 'dialogue-batcher' })
  const limit = dialogueAssetsConfig.batch.limit
  // defaults: 先頭 missing から共有値を抽出（無ければ appConfig の centralized defaults）
  const defaults = missing.length > 0 ? {
    fontSize: missing[0].fontSize,
    lineHeight: missing[0].lineHeight,
    letterSpacing: missing[0].letterSpacing,
    padding: missing[0].padding,
  } : {
    fontSize: appConfig.rendering.verticalText.defaults.fontSize,
    lineHeight: appConfig.rendering.verticalText.defaults.lineHeight,
    letterSpacing: appConfig.rendering.verticalText.defaults.letterSpacing,
    padding: appConfig.rendering.verticalText.defaults.padding,
  }

  let offset = 0
  const allResults: Array<{ pngBuffer: Buffer; meta: { width?: number; height?: number } }> = []
  while (offset < missing.length) {
    const slice = missing.slice(offset, offset + limit)
    try {
      // Preserve per-dialogue layout params (maxCharsPerLine, font) so API can size correctly
      const apiRes = await renderVerticalTextBatch({
        defaults,
        // API 仕様上 items は VerticalTextRenderRequest 相当: key/style は送らない
        items: slice.map(s => ({
          text: s.text,
          maxCharsPerLine: s.maxCharsPerLine,
          font: s.font,
        })),
      })
      if (Array.isArray(apiRes)) allResults.push(...apiRes)
      else throw new Error('vertical-text batch returned non-array')
    } catch (e) {
      logger.error('vertical_text_batch_failed', { error: e instanceof Error ? e.message : String(e) })
      throw e
    }
    offset += limit
  }
  if (allResults.length !== missing.length) {
    throw new Error(`vertical-text batch size mismatch: requested ${missing.length}, got ${allResults.length}`)
  }
  ensureCanvasInited()
  await Promise.all(allResults.map(async (res, idx) => {
    const req = missing[idx]
    try {
      const img = await loadImage(res.pngBuffer)
      const asset: DialogueImageAsset = { image: img as unknown as CanvasImageSource, width: img.width || res.meta.width || 1, height: img.height || res.meta.height || 1 }
      setDialogueAsset(req.key, asset)
    } catch (e) {
      logger.warn('load_image_failed_placeholder', { key: req.key, error: e instanceof Error ? e.message : String(e) })
      const w = res.meta.width || 1
      const h = res.meta.height || 1
      const placeholder = createCanvas(w, h)
      setDialogueAsset(req.key, { image: placeholder as unknown as CanvasImageSource, width: w, height: h })
    }
  }))
}
