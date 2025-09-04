import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakV2 } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface RenderingOptions {
  isDemo?: boolean
}

export interface RenderingResult {
  rendered: boolean
  skippedReason?: string
}

/**
 * Step responsible for rendering pages from layout plans
 */
export class RenderingStep implements PipelineStep {
  readonly stepName = 'rendering'

  /**
   * Render pages for episodes or skip in demo/test environments
   */
  async renderEpisodes(
    episodeNumbers: number[],
    options: RenderingOptions,
    context: StepContext,
  ): Promise<StepExecutionResult<RenderingResult>> {
    const { jobId, logger } = context

    try {
      // デモモードでは重いレンダリングをスキップ
      const shouldRender = !options.isDemo
      const _isLightweightMode = process.env.NODE_ENV === 'test'

      if (!shouldRender) {
        logger.warn('Skipping render in demo mode', {
          jobId,
          episodeCount: episodeNumbers.length,
          reason: 'Demo mode',
        })
        return {
          success: true,
          data: {
            rendered: false,
            skippedReason: 'Demo mode',
          },
        }
      }

      logger.info('Starting rendering for all episodes', {
        jobId,
        episodeCount: episodeNumbers.length,
        episodes: episodeNumbers,
      })

      try {
        // Render pages for each episode
        const ports = getStoragePorts()

        // 進捗管理のためのヘルパー関数
        const { db } = await import('@/services/database/index')
        const jobDb = db.jobs()
        const renderDb = db.render()

        let totalPagesProcessed = 0
        let totalPagesExpected = 0

        // 全エピソードの総ページ数を事前に計算（安全のためページ番号を正規化してから計算）
        const normalizePlanPages = (panels: Array<{ pageNumber?: number }>) => {
          const { appConfig } = require('@/config/app.config')
          const MAX_PAGES: number = appConfig.rendering.limits.maxPages
          // 1) 不正な値を1以上の整数に補正
          const cleaned = panels.map((p) => ({
            pageNumber: Math.max(1, Math.floor(Number(p.pageNumber ?? 1))),
          }))
          // 2) 実際に現れるページ番号を昇順でユニーク化
          const uniqSorted = Array.from(new Set(cleaned.map((p) => p.pageNumber))).sort(
            (a, b) => a - b,
          )
          // 3) 上限キャップ（極端な誤出力対策）
          const limited = uniqSorted.slice(0, MAX_PAGES)
          // 4) マッピング表を作り、密な 1..N に再割当
          const map = new Map<number, number>(limited.map((v, i) => [v, i + 1]))
          const normalized = cleaned.map((p) => ({ pageNumber: map.get(p.pageNumber) ?? 1 }))
          if (
            uniqSorted.length !== limited.length ||
            !uniqSorted.every((v, i) => v === limited[i])
          ) {
            logger.warn('Page number normalization applied to PageBreakPlan', {
              jobId,
              uniquePages: uniqSorted.length,
              limitedTo: limited.length,
              maxCap: MAX_PAGES,
            })
          }
          return normalized
        }

        // 全エピソードの総ページ数を事前に計算
        for (const ep of episodeNumbers) {
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (layoutText) {
            const parsed = JSON.parse(layoutText)
            if (Array.isArray(parsed?.pages)) {
              totalPagesExpected += parsed.pages.length
            } else if (Array.isArray(parsed?.panels)) {
              const panels = parsed.panels as Array<{ pageNumber?: number }>
              const normalized = normalizePlanPages(panels)
              const maxPage = Math.max(...normalized.map((p) => p.pageNumber))
              totalPagesExpected += maxPage
            }
          }
        }

        logger.info('レンダリング開始', {
          jobId,
          episodeCount: episodeNumbers.length,
          totalPagesExpected,
        })

        for (const ep of episodeNumbers) {
          // ここで「ストレージ（ファイル）からページ割り計画/YAMLレイアウトを読み込む」
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (layoutText) {
            const parsed = JSON.parse(layoutText)
            const hasPagesArray = Array.isArray(parsed?.pages)
            const isEmptyPages = hasPagesArray && parsed.pages.length === 0
            const isMangaLayout = hasPagesArray && parsed.pages[0]?.panels?.[0]?.position

            if (isEmptyPages) {
              logger.warn('Skipping rendering for episode with 0 pages', { jobId, episode: ep })
              continue
            }

            if (isMangaLayout) {
              const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
              const normalized = normalizeAndValidateLayout(parsed)

              const { MangaPageRenderer } = await import('@/lib/canvas/manga-page-renderer')
              const { appConfig } = await import('@/config/app.config')
              const renderer = await MangaPageRenderer.create({
                pageWidth: appConfig.rendering.defaultPageSize.width,
                pageHeight: appConfig.rendering.defaultPageSize.height,
                margin: 20,
                panelSpacing: 10,
                defaultFont: 'sans-serif',
                fontSize: 14,
              })
              try {
                for (const p of normalized.layout.pages) {
                  // 現在処理中のページを更新
                  jobDb.updateProcessingPosition(jobId, { episode: ep, page: p.page_number })

                  const imageBlob = await renderer.renderToImage(
                    normalized.layout,
                    p.page_number,
                    'png',
                  )
                  const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())
                  await ports.render.putPageRender(jobId, ep, p.page_number, imageBuffer)
                  const { ThumbnailGenerator } = await import('@/lib/canvas/thumbnail-generator')
                  const thumbBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, {
                    width: 200,
                    height: 280,
                    quality: 0.8,
                    format: 'jpeg',
                  })
                  const thumbnailBuffer = Buffer.from(await thumbBlob.arrayBuffer())
                  await ports.render.putPageThumbnail(jobId, ep, p.page_number, thumbnailBuffer)

                  // レンダリング状態をDBに記録（これによりrenderedPagesが自動的に増加）
                  renderDb.upsertRenderStatus(jobId, ep, p.page_number, {
                    isRendered: true,
                    imagePath: `${jobId}/episode_${ep}/page_${p.page_number}.png`,
                    thumbnailPath: `${jobId}/episode_${ep}/thumbnails/page_${p.page_number}_thumb.png`,
                    width: renderer.pageWidth,
                    height: renderer.pageHeight,
                    fileSize: imageBuffer.length,
                  })

                  totalPagesProcessed++

                  // 進捗ログ
                  logger.info(`レンダリング進捗: EP${ep} ページ${p.page_number}完了`, {
                    jobId,
                    episode: ep,
                    page: p.page_number,
                    progress: `${totalPagesProcessed}/${totalPagesExpected}`,
                    progressPercent: Math.round((totalPagesProcessed / totalPagesExpected) * 100),
                  })
                }
              } finally {
                renderer.cleanup()
              }
            } else if (Array.isArray(parsed?.panels) && parsed.panels.length > 0) {
              // Validate PageBreakV2 (hard invalid → stop with explicit error)
              const { appConfig } = require('@/config/app.config')
              const { validatePageBreakV2 } = require('@/utils/pagebreak-validator')
              const validation = validatePageBreakV2(parsed, {
                maxPages: appConfig.rendering.limits.maxPages,
              })
              if (!validation.valid) {
                throw new Error(
                  `Invalid PageBreakV2: ${validation.issues.slice(0, 5).join('; ')}${
                    validation.issues.length > 5 ? ' ...' : ''
                  }`,
                )
              }
              // Normalize page numbers to a safe contiguous range before rendering
              const MAX_PAGES: number = appConfig.rendering.limits.maxPages
              type LoosePanel = Partial<PageBreakV2['panels'][0]> & { pageNumber?: number }
              const rawPanels = parsed.panels as LoosePanel[]
              const cleaned = rawPanels.map((p) => ({
                pageNumber: Math.max(1, Math.floor(Number(p.pageNumber ?? 1))),
                panelIndex: p.panelIndex ?? 1,
                content: p.content ?? '',
                dialogue: p.dialogue ?? [],
                sfx: p.sfx ?? [],
              }))
              const uniqSorted = Array.from(new Set(cleaned.map((p) => p.pageNumber))).sort(
                (a, b) => a - b,
              )
              const limited = uniqSorted.slice(0, MAX_PAGES)
              const map = new Map<number, number>(limited.map((v, i) => [v, i + 1]))
              const normalizedPanels = cleaned.map((p) => ({
                ...p,
                pageNumber: map.get(p.pageNumber) ?? 1,
              })) as PageBreakV2['panels']
              if (
                validation.needsNormalization ||
                uniqSorted.length !== limited.length ||
                !uniqSorted.every((v, i) => v === limited[i])
              ) {
                logger.warn('PageBreakV2 panels normalized due to out-of-range page numbers', {
                  jobId,
                  episode: ep,
                  uniquePages: uniqSorted.length,
                  limitedTo: limited.length,
                  maxCap: MAX_PAGES,
                })
              }

              const pageBreakPlan: PageBreakV2 = { panels: normalizedPanels }
              const { renderFromPageBreakPlan } = await import('@/services/application/render')

              // PageBreakPlan形式でのレンダリング（進捗更新付き）
              const result = await renderFromPageBreakPlan(jobId, ep, pageBreakPlan, ports, {
                skipExisting: false,
                concurrency: 3,
              })

              totalPagesProcessed += result.renderedPages

              logger.info(`レンダリング完了: EP${ep}`, {
                jobId,
                episode: ep,
                renderedPages: result.renderedPages,
                totalPages: result.totalPages,
                progress: `${totalPagesProcessed}/${totalPagesExpected}`,
              })
            } else {
              logger.warn('Layout JSON is neither MangaLayout nor valid PageBreakV2; skipping', {
                jobId,
                episode: ep,
                keys: Object.keys(parsed || {}),
              })
            }
          }
        }
        logger.info('PageBreakPlan rendering completed for all episodes', { jobId })

        return {
          success: true,
          data: { rendered: true },
        }
      } catch (renderError) {
        const errorMessage =
          renderError instanceof Error ? renderError.message : String(renderError)
        logger.error('PageBreakPlan rendering failed', {
          jobId,
          error: errorMessage,
          stack: renderError instanceof Error ? renderError.stack : undefined,
        })
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Rendering step failed', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
