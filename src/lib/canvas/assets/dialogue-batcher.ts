import { appConfig } from '@/config/app.config'
import { dialogueAssetsConfig } from '@/config/dialogue-assets.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { type RenderedVerticalTextBatchItem, renderVerticalTextBatch } from '@/services/vertical-text-client'
import { resolveContentBounds } from '@/types/vertical-text'
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
  const baseLimit = dialogueAssetsConfig.batch.limit
  const adaptiveCfg = dialogueAssetsConfig.batch.adaptive
  let dynamicLimit: number = adaptiveCfg?.enabled ? adaptiveCfg.initial : baseLimit
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
  const allResults: RenderedVerticalTextBatchItem[] = []

  const makePlaceholderResult = (width: number, height: number): RenderedVerticalTextBatchItem => {
    const safeWidth = Math.max(1, Math.round(width))
    const safeHeight = Math.max(1, Math.round(height))
    return {
      pngBuffer: Buffer.alloc(0),
      meta: {
        image_base64: 'VT_PLACEHOLDER',
        width: safeWidth,
        height: safeHeight,
        trimmed: true,
        content_bounds: { x: 0, y: 0, width: safeWidth, height: safeHeight },
      },
    }
  }

  // 再帰的バッチ実行（失敗時二分割フォールバック）
  const execBatchRecursive = async (
    slice: DialogueBatchRequestItem[],
  ): Promise<RenderedVerticalTextBatchItem[]> => {
    if (slice.length === 0) return []
    try {
      const t0 = performance.now()
      const apiRes = await renderVerticalTextBatch({
        defaults,
        items: slice.map(s => ({ text: s.text, maxCharsPerLine: s.maxCharsPerLine, font: s.font })),
      })
      const dt = performance.now() - t0
      if (adaptiveCfg?.enabled) {
        if (dt > adaptiveCfg.slowThresholdMs && dynamicLimit > adaptiveCfg.min) {
          dynamicLimit = Math.max(adaptiveCfg.min, Math.floor(dynamicLimit * adaptiveCfg.adjustFactor)) as number
          logger.info('vertical_text_batch_adapt_down', { prev: slice.length, next: dynamicLimit, ms: dt })
        } else if (dt < adaptiveCfg.fastThresholdMs && dynamicLimit < adaptiveCfg.max) {
          const grow = Math.max(1, Math.floor(dynamicLimit * 0.25))
          dynamicLimit = Math.min(adaptiveCfg.max, dynamicLimit + grow) as number
          logger.info('vertical_text_batch_adapt_up', { prev: slice.length, next: dynamicLimit, ms: dt })
        }
      }
      if (!Array.isArray(apiRes)) throw new Error('vertical-text batch returned non-array')
      return apiRes as RenderedVerticalTextBatchItem[]
    } catch (err) {
      // 単一要素ならプレースホルダ（後段 loadImage で置換不要 / meta 最低寸法）
      if (slice.length === 1) {
        logger.warn('vertical_text_single_failed_placeholder', { key: slice[0].key, error: err instanceof Error ? err.message : String(err) })
        return [makePlaceholderResult(10, 10)]
      }
      // 二分割して部分成功を試みる
      const mid = Math.floor(slice.length / 2)
      if (mid === 0) throw err
      logger.warn('vertical_text_batch_split_retry', { size: slice.length, error: err instanceof Error ? err.message : String(err) })
      const left = await execBatchRecursive(slice.slice(0, mid))
      const right = await execBatchRecursive(slice.slice(mid))
      return [...left, ...right]
    }
  }
  while (offset < missing.length) {
    const effectiveLimit = Math.min(dynamicLimit, baseLimit)
    const slice = missing.slice(offset, offset + effectiveLimit)
    const apiRes = await execBatchRecursive(slice)
    allResults.push(...apiRes)
    offset += effectiveLimit
  }
  if (allResults.length !== missing.length) {
    throw new Error(`vertical-text batch size mismatch: requested ${missing.length}, got ${allResults.length}`)
  }
  ensureCanvasInited()
  await Promise.all(allResults.map(async (res, idx) => {
    const req = missing[idx]
    try {
      const img = await loadImage(res.pngBuffer)
      const width = img.width || res.meta.width || 1
      const height = img.height || res.meta.height || 1
      const bounds = resolveContentBounds(res.meta)
      const asset: DialogueImageAsset = {
        image: img as unknown as CanvasImageSource,
        width,
        height,
        contentBounds: bounds,
      }
      setDialogueAsset(req.key, asset)
    } catch (e) {
      logger.warn('load_image_failed_placeholder', { key: req.key, error: e instanceof Error ? e.message : String(e) })
      const w = res.meta.width || 1
      const h = res.meta.height || 1
      const placeholder = createCanvas(w, h)
      const bounds = resolveContentBounds(res.meta) ?? { x: 0, y: 0, width: w, height: h }
      setDialogueAsset(req.key, {
        image: placeholder as unknown as CanvasImageSource,
        width: w,
        height: h,
        contentBounds: bounds,
      })
    }
  }))
}
