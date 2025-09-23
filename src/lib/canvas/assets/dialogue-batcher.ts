import { dialogueAssetsConfig } from '@/config/dialogue-assets.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { renderVerticalTextBatch } from '@/services/vertical-text-client'
import { ensureCanvasInited, loadImage } from '../core/canvas-init'
import { type DialogueImageAsset, getDialogueAsset, setDialogueAsset } from './dialogue-cache'

export interface DialogueBatchRequestItem {
  key: string
  text: string
  style: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  padding: number
}

export async function ensureDialogueAssets(requests: DialogueBatchRequestItem[]): Promise<void> {
  const missing = requests.filter(r => !getDialogueAsset(r.key))
  if (missing.length === 0) return
  const logger = getLogger().withContext({ service: 'dialogue-batcher' })
  const limit = dialogueAssetsConfig.batch.limit
  const defaults = missing.length > 0 ? {
    fontSize: missing[0].fontSize,
    lineHeight: missing[0].lineHeight,
    letterSpacing: missing[0].letterSpacing,
    padding: missing[0].padding,
  } : { fontSize: 24, lineHeight: 1.6, letterSpacing: 0, padding: 12 }

  let offset = 0
  const allResults: Array<{ pngBuffer: Buffer; meta: { width?: number; height?: number } }> = []
  while (offset < missing.length) {
    const slice = missing.slice(offset, offset + limit)
    try {
      const apiRes = await renderVerticalTextBatch({ defaults, items: slice.map(s => ({ key: s.key, text: s.text, style: s.style })) })
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
      setDialogueAsset(req.key, { image: { width: res.meta.width || 1, height: res.meta.height || 1 } as unknown as CanvasImageSource, width: res.meta.width || 1, height: res.meta.height || 1 })
    }
  }))
}
