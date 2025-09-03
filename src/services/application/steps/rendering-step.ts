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
        const { getDatabaseService } = await import('@/services/db-factory')
        const db = getDatabaseService()

        let totalPagesProcessed = 0
        let totalPagesExpected = 0

        // 全エピソードの総ページ数を事前に計算
        for (const ep of episodeNumbers) {
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (layoutText) {
            const parsed = JSON.parse(layoutText)
            if (Array.isArray(parsed?.pages)) {
              totalPagesExpected += parsed.pages.length
            } else if (Array.isArray(parsed?.panels)) {
              const panels = parsed.panels as Array<{ pageNumber?: number }>
              const maxPage = Math.max(...panels.map((p) => p.pageNumber ?? 1))
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
                  await db.updateProcessingPosition(jobId, { episode: ep, page: p.page_number })

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
                  await db.updateRenderStatus(jobId, ep, p.page_number, {
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
              const pageBreakPlan: PageBreakV2 = parsed
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
