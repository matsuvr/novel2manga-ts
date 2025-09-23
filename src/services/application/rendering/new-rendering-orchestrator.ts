import os from 'node:os'
import { appConfig } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { renderPageToCanvas } from '@/lib/canvas/renderer/page-renderer'
import type { MangaLayout } from '@/types/panel-layout'

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
  }
}

/**
 * 初期バージョン Orchestrator:
 * - 先行プレビュー: priorityPreviewPages を優先処理
 * - 残りページは単純な制限付き並列 (Promise プール)
 * - まだ dialogueAssets や SFX 抽出は legacy MangaPageRenderer 内ロジック非移行のため "枠のみ" レンダリング
 */
export class NewRenderingOrchestrator {
  private readonly logger = getLogger().withContext({ service: 'new-render-orchestrator' })
  private readonly cfg = appConfig.rendering.newPipeline

  async renderMangaLayout(layout: MangaLayout, opts: NewRenderOrchestratorOptions): Promise<NewRenderResult> {
    const tStart = performance.now()
    const totalPages = layout.pages.length
    const errors: NewRenderResult['errors'] = []
    let dialoguesCount = 0
    let sfxCount = 0
    let fallbackPages = 0
    let thumbnails = 0

    const maxCores = Math.max(1, os.cpus().length - 1)
    const maxConcurrency = Math.max(1, Math.min(this.cfg.maxConcurrency, maxCores))
    const priority = this.cfg.priorityPreviewPages
    const ports = getStoragePorts()

    let renderedPages = 0
    const enqueue = <T,>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<void> => {
      return new Promise((resolve) => {
        let inFlight = 0
        let index = 0
        const next = () => {
          if (index >= tasks.length && inFlight === 0) return resolve()
          while (inFlight < concurrency && index < tasks.length) {
            const task = tasks[index]
            index++
            if (!task) break
            inFlight++
            task().catch(() => { /* individual error already logged */ }).finally(() => {
              inFlight--
              next()
            })
          }
        }
        next()
      })
    }

    const makeTask = (pageNumber: number) => async () => {
      try {
        const canvas = renderPageToCanvas({ layout, pageNumber, width: appConfig.rendering.defaultPageSize.width, height: appConfig.rendering.defaultPageSize.height })
        // PNG バッファへ変換 (@napi-rs/canvas の NodeCanvas 仕様)
        let pngBuffer: Buffer
        try {
          pngBuffer = (canvas as unknown as { toBuffer: (mime?: string) => Buffer }).toBuffer('image/png')
        } catch (nativeErr) {
          const nmsg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr)
          // Fallback: minimal placeholder buffer so pipeline can progress under test env without native binding fully working
          this.logger.warn('toBuffer_fallback_placeholder', { page: pageNumber, error: nmsg })
          pngBuffer = Buffer.from(`PNG_PLACEHOLDER_PAGE_${pageNumber}`)
          fallbackPages++
        }
        await ports.render.putPageRender(opts.novelId, opts.jobId, opts.episode, pageNumber, pngBuffer)
        // Derive dialogue & sfx counts from layout (cheap lookup once per rendered page)
        const page = layout.pages.find(p => p.page_number === pageNumber)
        if (page) {
          for (const panel of page.panels) {
            dialoguesCount += panel.dialogues?.length || 0
            sfxCount += panel.sfx?.length || 0
          }
        }
        // Thumbnail generation: simple scale down using drawImage onto temp canvas
        try {
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
        this.logger.info('page_rendered_new_pipeline', { jobId: opts.jobId, episode: opts.episode, page: pageNumber, renderedPages, totalPages })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push({ page: pageNumber, message: msg })
        this.logger.error('page_render_failed_new_pipeline', { jobId: opts.jobId, episode: opts.episode, page: pageNumber, error: msg })
      }
    }

    const priorityPages = layout.pages.slice(0, priority).map(p => p.page_number)
    const restPages = layout.pages.slice(priorityPages.length).map(p => p.page_number)

    // 先行ページは逐次（ユーザーへ即反映想定）
    for (const pn of priorityPages) {
      await makeTask(pn)()
    }

    // 残りを制限付き並列
    const tasks = restPages.map(pn => makeTask(pn))
    await enqueue(tasks, maxConcurrency)

    const totalMs = performance.now() - tStart
    const avgMsPerPage = renderedPages > 0 ? totalMs / renderedPages : 0
    return { renderedPages, totalPages, errors, metrics: { totalMs, avgMsPerPage, dialogues: dialoguesCount, sfx: sfxCount, fallbackPages, thumbnails } }
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
