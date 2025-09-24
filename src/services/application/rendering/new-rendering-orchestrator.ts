import os from 'node:os'
import { appConfig } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { type DialogueBatchRequestItem, ensureDialogueAssets } from '@/lib/canvas/assets/dialogue-batcher'
import { buildDialogueKey } from '@/lib/canvas/assets/dialogue-key'
import { globalMeasureTextCache } from '@/lib/canvas/metrics/measure-text-cache'
import { renderPageToCanvas } from '@/lib/canvas/renderer/page-renderer'
// (Optional future) pure renderer import preserved in separate file; current orchestrator uses renderPageToCanvas facade.
import type { MangaLayout } from '@/types/panel-layout'
import { getFontForDialogue } from '@/types/vertical-text'
import { collectDialogueTexts, createDialogueSegmentsPipeline } from './assets/dialogue-segments-pipeline'

export interface NewRenderOrchestratorOptions {
  novelId: string
  jobId: string
  episode: number
}

export interface NewRenderResult {
  renderedPages: number
  totalPages: number
  errors: Array<{ page: number; message: string }>
  metrics?: {
    totalMs: number
    avgMsPerPage: number
    dialogues: number
    sfx: number
    fallbackPages: number
    thumbnails: number
    pagesReused: number
    textMeasureCacheHits: number
    textMeasureCacheMisses: number
    verticalDialogueTotal?: number
    verticalDialogueGenerated?: number
  }
}

/**
 * 初期バージョン Orchestrator:
 * - 先行プレビュー: priorityPreviewPages を優先処理
 * - 残りページは単純な制限付き並列 (Promise プール)
 * - まだ dialogueAssets や SFX 抽出は legacy MangaPageRenderer 内ロジック非移行のため "枠のみ" レンダリング
 */
export interface OrchestratorDeps {
  limit?: (concurrency: number) => <T>(fn: () => Promise<T>) => Promise<T>
  createCanvasFn?: (w: number, h: number) => unknown
}

export class NewRenderingOrchestrator {
  private readonly logger = getLogger().withContext({ service: 'new-render-orchestrator' })
  private readonly cfg = appConfig.rendering.newPipeline
  private readonly limitFactory: OrchestratorDeps['limit']
  private readonly createCanvasFn: (w: number, h: number) => unknown

  constructor(deps: OrchestratorDeps = {}) {
    this.limitFactory = deps.limit
    this.createCanvasFn = deps.createCanvasFn ?? ((w, h) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createCanvas } = require('@napi-rs/canvas') as { createCanvas: (w: number, h: number) => unknown }
        return createCanvas(w, h)
      } catch (e) {
        this.logger.warn('createCanvas_dynamic_failed', { error: e instanceof Error ? e.message : String(e) })
        return { width: w, height: h }
      }
    })
  }

  async renderMangaLayout(layout: MangaLayout, opts: NewRenderOrchestratorOptions): Promise<NewRenderResult> {
    const tStart = performance.now()
    const totalPages = layout.pages.length
    const errors: NewRenderResult['errors'] = []
    let dialoguesCount = 0
    let sfxCount = 0
    let fallbackPages = 0
  let thumbnails = 0
  let reusedHits = 0
  const textMeasureCacheHitsStart = globalMeasureTextCache.stats().hits
  const textMeasureCacheMissesStart = globalMeasureTextCache.stats().misses

    const maxCores = Math.max(1, os.cpus().length - 1)
    const maxConcurrency = Math.max(1, Math.min(this.cfg.maxConcurrency, maxCores))
    const priority = this.cfg.priorityPreviewPages
    const ports = getStoragePorts()

    let renderedPages = 0
    const enqueue = <T,>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<void> => {
      if (this.limitFactory) {
        const limiter = this.limitFactory(concurrency)
        let chain: Promise<unknown> = Promise.resolve()
        for (const task of tasks) {
          chain = chain.then(() => limiter(task))
        }
        return chain.then(() => undefined)
      }
      // fallback inline pool (small and battle-tested earlier)
      return new Promise((resolve) => {
        let inFlight = 0
        let index = 0
        const next = () => {
          if (index >= tasks.length && inFlight === 0) return resolve()
          while (inFlight < concurrency && index < tasks.length) {
            const task = tasks[index++]
            inFlight++
            task().catch((err) => {
              this.logger.debug('task_error_swallowed_limit', { error: err instanceof Error ? err.message : String(err) })
            }).finally(() => { inFlight--; next() })
          }
        }
        next()
      })
    }


    // --- Asset Pipeline: dialogue segmentation pre-warm ---
  const dialogueTexts = collectDialogueTexts(layout as unknown as { pages: MangaLayout['pages'] })
    const segmentsPipeline = createDialogueSegmentsPipeline(20)
    segmentsPipeline.prepare(dialogueTexts)
    this.logger.info('segments_pipeline_prepared', segmentsPipeline.stats())

    // --- Dialogue Vertical Image Assets (batch generation) ---
    // Collect unique dialogues across all pages for batching
  const vtDefaults = appConfig.rendering.verticalText.defaults
  const uniq = new Map<string, DialogueBatchRequestItem>()
    for (const page of layout.pages) {
      for (const panel of page.panels) {
        if (!panel.dialogues) continue
        for (const d of panel.dialogues) {
          const text = d.text?.trim()
          if (!text) continue
          const key = buildDialogueKey({
            dialogue: d,
            fontSize: vtDefaults.fontSize,
            lineHeight: vtDefaults.lineHeight,
            letterSpacing: vtDefaults.letterSpacing,
            padding: vtDefaults.padding,
            maxCharsPerLine: vtDefaults.maxCharsPerLine,
          })
            if (uniq.has(key)) continue
          const font = getFontForDialogue(d)
          uniq.set(key, {
            key,
            text,
            style: d.type || 'speech',
            fontSize: vtDefaults.fontSize,
            lineHeight: vtDefaults.lineHeight,
            letterSpacing: vtDefaults.letterSpacing,
            padding: vtDefaults.padding,
            maxCharsPerLine: vtDefaults.maxCharsPerLine,
            font,
          })
        }
      }
    }
    const verticalDialogueTotal = uniq.size
    let verticalDialogueGenerated = 0
    try {
      const before = Date.now()
      await ensureDialogueAssets(Array.from(uniq.values()))
      verticalDialogueGenerated = uniq.size // ensureDialogueAssets only generates missing; all were missing first run
      const after = Date.now()
      this.logger.info('vertical_dialogue_assets_ready', { total: verticalDialogueTotal, ms: after - before })
    } catch (e) {
      this.logger.warn('vertical_dialogue_assets_failed', { error: e instanceof Error ? e.message : String(e), planned: verticalDialogueTotal })
    }

    // --- Canvas Pool (simple reuse to avoid repeated native allocations) ---
    // 型: @napi-rs/canvas の createCanvas 戻り値（ランタイム import のため正確型を参照できない）
    // 最低限 width/height/toBuffer/getContext を持つと想定
    interface ReusableCanvasLike {
      width: number
      height: number
      getContext?: (t: '2d') => CanvasRenderingContext2D | null
      toBuffer?: (mime?: string) => Buffer
    }
    interface PooledCanvas { canvas: ReusableCanvasLike; busy: boolean }
    const canvasPool: PooledCanvas[] = []
    const acquireCanvas = (): ReusableCanvasLike => {
      const free = canvasPool.find(c => !c.busy)
      if (free) { free.busy = true; reusedHits++; return free.canvas }
      // 新規生成（サイズ: defaultPageSize）
      const createdCanvas = this.createCanvasFn(appConfig.rendering.defaultPageSize.width, appConfig.rendering.defaultPageSize.height) as ReusableCanvasLike
      const created: PooledCanvas = { canvas: createdCanvas, busy: true }
      canvasPool.push(created)
      return created.canvas
    }
    const releaseCanvas = (c: ReusableCanvasLike) => {
      const found = canvasPool.find(p => p.canvas === c)
      if (found) found.busy = false
    }

    // Wrap original task maker to inject pipeline + retry (1 retry for transient errors)
    const makeTaskWithAssets = (pageNumber: number) => async () => {
      let attempts = 0
      const maxAttempts = 2 // first try + 1 retry
      while (attempts < maxAttempts) {
        attempts++
        try {
          const pooled = acquireCanvas()
          // getContext が未定義の場合は再利用前にダミーを付与（型整合用 / 実際の createCanvas では提供される想定）
          if (!pooled.getContext) {
            ;(pooled as ReusableCanvasLike & { getContext: (t: '2d') => CanvasRenderingContext2D | null }).getContext = () => null
          }
          const canvas = renderPageToCanvas({ layout, pageNumber, width: appConfig.rendering.defaultPageSize.width, height: appConfig.rendering.defaultPageSize.height, targetCanvas: pooled as ReusableCanvasLike & { getContext: (t: '2d') => CanvasRenderingContext2D | null } }, undefined, { segmentsPipeline })
          // The rest identical to makeTask body (could refactor, kept inline to minimize churn)
          let pngBuffer: Buffer
          try {
            pngBuffer = (canvas as unknown as { toBuffer: (mime?: string) => Buffer }).toBuffer('image/png')
          } catch (nativeErr) {
            const nmsg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr)
            this.logger.warn('toBuffer_fallback_placeholder', { page: pageNumber, error: nmsg })
            pngBuffer = Buffer.from(`PNG_PLACEHOLDER_PAGE_${pageNumber}`)
            fallbackPages++
          }
          await ports.render.putPageRender(opts.novelId, opts.jobId, opts.episode, pageNumber, pngBuffer)
          const page = layout.pages.find(p => p.page_number === pageNumber)
          if (page) {
            for (const panel of page.panels) {
              dialoguesCount += panel.dialogues?.length || 0
              sfxCount += panel.sfx?.length || 0
            }
          }
          if (appConfig.rendering.generateThumbnails) try {
            const thumbWidth = 256
            interface SizedCanvas { width: number; height: number; toBuffer?: (mime?: string) => Buffer }
            const sized = canvas as unknown as SizedCanvas
            if (typeof sized.width === 'number' && typeof sized.height === 'number' && sized.width > 0) {
              const ratio = thumbWidth / sized.width
              const thumbHeight = Math.round(sized.height * ratio)
              const ThumbFactory = (canvas.constructor as unknown as { createCanvas?: (w: number, h: number) => SizedCanvas }).createCanvas
              const thumbCanvas: SizedCanvas & { getContext?: (type: string) => CanvasRenderingContext2D | null } = ThumbFactory ? ThumbFactory(thumbWidth, thumbHeight) : createFallbackThumbCanvas(thumbWidth, thumbHeight)
              const tctx = thumbCanvas.getContext?.('2d')
              if (tctx?.drawImage) {
                tctx.drawImage(canvas as unknown as HTMLCanvasElement, 0, 0, thumbWidth, thumbHeight)
                let thumbPng: Buffer
                try {
                  thumbPng = thumbCanvas.toBuffer ? thumbCanvas.toBuffer('image/png') : Buffer.from(`PNG_THUMB_PLACEHOLDER_${pageNumber}`)
                } catch {
                  thumbPng = Buffer.from(`PNG_THUMB_PLACEHOLDER_${pageNumber}`)
                }
                await ports.render.putPageThumbnail(opts.novelId, opts.jobId, opts.episode, pageNumber, thumbPng)
                thumbnails++
              }
            }
          } catch (thumbErr) {
            this.logger.warn('thumbnail_generation_failed', { page: pageNumber, error: thumbErr instanceof Error ? thumbErr.message : String(thumbErr) })
          }
          renderedPages++
          this.logger.info('page_rendered_new_pipeline', { jobId: opts.jobId, episode: opts.episode, page: pageNumber, renderedPages, totalPages, attempts, reusedHits })
          releaseCanvas(pooled)
          return
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (attempts < maxAttempts) {
            this.logger.warn('page_render_retry', { page: pageNumber, attempts, error: msg })
            continue
          }
          errors.push({ page: pageNumber, message: msg })
          this.logger.error('page_render_failed_new_pipeline', { jobId: opts.jobId, episode: opts.episode, page: pageNumber, error: msg, attempts })
          return
        }
      }
    }

    const priorityPages = layout.pages.slice(0, priority).map(p => p.page_number)
    const restPages = layout.pages.slice(priorityPages.length).map(p => p.page_number)

    for (const pn of priorityPages) {
      await makeTaskWithAssets(pn)()
    }
    const tasks = restPages.map(pn => makeTaskWithAssets(pn))
    await enqueue(tasks, maxConcurrency)

    const totalMs = performance.now() - tStart
    const avgMsPerPage = renderedPages > 0 ? totalMs / renderedPages : 0
    const cacheStats = globalMeasureTextCache.stats()
    const deltaHits = cacheStats.hits - textMeasureCacheHitsStart
    const deltaMisses = cacheStats.misses - textMeasureCacheMissesStart
    return { renderedPages, totalPages, errors, metrics: { totalMs, avgMsPerPage, dialogues: dialoguesCount, sfx: sfxCount, fallbackPages, thumbnails, pagesReused: reusedHits, textMeasureCacheHits: deltaHits, textMeasureCacheMisses: deltaMisses, verticalDialogueTotal, verticalDialogueGenerated } }
  }
}

// Fallback tiny canvas factory if constructor.createCanvas is absent
interface FallbackCanvas { width: number; height: number; getContext: (t: string) => CanvasRenderingContext2D | null; toBuffer: (mime?: string) => Buffer }
function createFallbackThumbCanvas(w: number, h: number): FallbackCanvas {
  // Use @napi-rs/canvas createCanvas via dynamic import if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require('@napi-rs/canvas') as { createCanvas: (w: number, h: number) => FallbackCanvas }
    return createCanvas(w, h)
  } catch {
    return {
      width: w,
      height: h,
      getContext: () => ({
        drawImage: () => { /* noop */ },
        // minimal shape for type compatibility
      } as unknown as CanvasRenderingContext2D),
      toBuffer: () => Buffer.from('PNG_EMPTY'),
    }
  }
}
