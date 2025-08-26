import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakPlan } from '@/types/script'
// no-op
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
      // デモやテスト環境では重いレンダリングをスキップ
      const shouldRender = !options.isDemo && process.env.NODE_ENV !== 'test'

      if (!shouldRender) {
        logger.warn('Skipping render in demo/test environment', {
          jobId,
          episodeCount: episodeNumbers.length,
          reason: 'Demo/test environment',
        })
        return {
          success: true,
          data: {
            rendered: false,
            skippedReason: 'Demo/test environment',
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
        for (const ep of episodeNumbers) {
          // ここで「ストレージ（ファイル）からページ割り計画/YAMLレイアウトを読み込む」
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (layoutText) {
            // JSON-first (MangaLayout or legacy PageBreakPlan) → YAML fallback
            try {
              const parsed = JSON.parse(layoutText)
              const isMangaLayout =
                Array.isArray(parsed?.pages) && parsed.pages[0]?.panels?.[0]?.position
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
                  }
                } finally {
                  renderer.cleanup()
                }
              } else {
                const pageBreakPlan: PageBreakPlan = parsed
                const { renderFromPageBreakPlan } = await import('@/services/application/render')
                await renderFromPageBreakPlan(jobId, ep, pageBreakPlan, ports, {
                  skipExisting: false,
                  concurrency: 3,
                })
              }
            } catch {
              // YAML fallback (backward compatibility)
              const { parseMangaLayoutFromYaml } = await import('@/utils/layout-parser')
              const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
              const parsedYaml = parseMangaLayoutFromYaml(layoutText)
              const normalized = normalizeAndValidateLayout(parsedYaml)

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
                }
              } finally {
                renderer.cleanup()
              }
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
