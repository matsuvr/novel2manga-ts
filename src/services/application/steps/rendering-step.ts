import { appConfig } from '@/config/app.config'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { PageBreakV2 } from '@/types/script'
import { getMaxNormalizedPage, type LoosePanel, normalizePlanPanels } from '@/utils/page-normalizer'
import { validatePageBreakV2 } from '@/utils/pagebreak-validator'
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
   * Render pages for episodes. A singleページ失敗で全体が止まらないようにページ単位でエラーを握りつぶし続行する。
   */
  async renderEpisodes(
    episodeNumbers: number[],
    options: RenderingOptions,
    context: StepContext,
  ): Promise<StepExecutionResult<RenderingResult>> {
    const { jobId, logger } = context

    try {
      const shouldRender = !options.isDemo
      if (!shouldRender) {
        logger.warn('Skipping render in demo mode', { jobId, episodeCount: episodeNumbers.length, reason: 'Demo mode' })
        return { success: true, data: { rendered: false, skippedReason: 'Demo mode' } }
      }

      logger.info('Starting rendering for all episodes', { jobId, episodeCount: episodeNumbers.length, episodes: episodeNumbers })

      try {
        const ports = getStoragePorts()
        const { db } = await import('@/services/database')
        const jobDb = db.jobs()
        const renderDb = db.render()

        let totalPagesProcessed = 0
        let totalPagesExpected = 0

        // 期待ページ数計算 (パース失敗はログしてスキップ)
        for (const ep of episodeNumbers) {
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (!layoutText) continue
          try {
            const parsed = JSON.parse(layoutText)
            if (Array.isArray(parsed?.pages)) totalPagesExpected += parsed.pages.length
            else if (Array.isArray(parsed?.panels)) {
              const panels = parsed.panels as Array<{ pageNumber?: number }>
              totalPagesExpected += getMaxNormalizedPage(panels)
            }
          } catch (e) {
            logger.error('Failed to parse layout JSON (skipping episode for expected count)', { jobId, episode: ep, error: (e as Error).message })
          }
        }

        logger.info('レンダリング開始', { jobId, episodeCount: episodeNumbers.length, totalPagesExpected })

        for (const ep of episodeNumbers) {
          const layoutText = await ports.layout.getEpisodeLayout(jobId, ep)
          if (!layoutText) continue

            let parsed: unknown
          try { parsed = JSON.parse(layoutText) } catch (e) { logger.error('Failed to parse layout JSON', { jobId, episode: ep, error: (e as Error).message }); continue }

          const parsedObj: Record<string, unknown> =
            parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
          const pagesVal = parsedObj.pages as unknown
          const hasPagesArray = Array.isArray(pagesVal)
          const isEmptyPages = hasPagesArray && (pagesVal as unknown[]).length === 0
          const firstPageArray: unknown[] | undefined = hasPagesArray
            ? (pagesVal as unknown[])
            : undefined
          const firstPage = firstPageArray ? firstPageArray[0] : undefined
          const isMangaLayout =
            hasPagesArray && firstPage && typeof firstPage === 'object' && 'panels' in firstPage

          if (isEmptyPages) { logger.warn('Skipping rendering for episode with 0 pages', { jobId, episode: ep }); continue }

          if (isMangaLayout) {
            const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
            let normalized: ReturnType<typeof normalizeAndValidateLayout>
            try {
              normalized = normalizeAndValidateLayout(parsed as Parameters<typeof normalizeAndValidateLayout>[0])
            } catch (normError) {
              logger.error('Layout normalization failed', { jobId, episode: ep, error: (normError as Error).message })
              continue
            }
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
                try {
                  // パネルの基本検証（ゼロサイズなど）
                  const rawPanels: unknown[] = (p as { panels?: unknown[] }).panels || []
                  const invalidPanels = rawPanels.filter((pl) => {
                    if (!pl || typeof pl !== 'object') return true
                    const size = (pl as { size?: { width?: unknown; height?: unknown } }).size
                    if (!size || typeof size !== 'object') return true
                    const { width, height } = size as { width?: unknown; height?: unknown }
                    return (
                      typeof width !== 'number' ||
                      typeof height !== 'number' ||
                      width <= 0 ||
                      height <= 0
                    )
                  })
                  if (invalidPanels.length > 0) {
                    logger.error('Skipping page due to invalid panel size(s)', { jobId, episode: ep, page: p.page_number, invalidPanels: invalidPanels.length })
                    totalPagesProcessed++
                    continue
                  }

                  jobDb.updateProcessingPosition(jobId, { episode: ep, page: p.page_number })
                  const imageBlob = await renderer.renderToImage(normalized.layout, p.page_number, 'png')
                  const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())
                  await ports.render.putPageRender(jobId, ep, p.page_number, imageBuffer)
                  const { ThumbnailGenerator } = await import('@/lib/canvas/thumbnail-generator')
                  const thumbBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, { width: 200, height: 280, quality: 0.8, format: 'jpeg' })
                  const thumbnailBuffer = Buffer.from(await thumbBlob.arrayBuffer())
                  await ports.render.putPageThumbnail(jobId, ep, p.page_number, thumbnailBuffer)
                  await renderDb.upsertRenderStatus(jobId, ep, p.page_number, {
                    isRendered: true,
                    imagePath: `${jobId}/episode_${ep}/page_${p.page_number}.png`,
                    thumbnailPath: `${jobId}/episode_${ep}/thumbnails/page_${p.page_number}_thumb.png`,
                    width: renderer.pageWidth,
                    height: renderer.pageHeight,
                    fileSize: imageBuffer.length,
                  })
                  totalPagesProcessed++
                  logger.info(`レンダリング進捗: EP${ep} ページ${p.page_number}完了`, { jobId, episode: ep, page: p.page_number, progress: `${totalPagesProcessed}/${totalPagesExpected}`, progressPercent: totalPagesExpected ? Math.round((totalPagesProcessed / totalPagesExpected) * 100) : null })
                } catch (pageError) {
                  logger.error('Page rendering failed (continuing)', { jobId, episode: ep, page: p.page_number, error: (pageError as Error).message })
                  totalPagesProcessed++
                }
              }
            } finally {
              try { renderer.cleanup() } catch { /* ignore */ }
            }
          } else if (
            parsedObj.panels &&
            Array.isArray(parsedObj.panels) &&
            (parsedObj.panels as unknown[]).length > 0
          ) {
            const validation = validatePageBreakV2(parsedObj as PageBreakV2, { maxPages: appConfig.rendering.limits.maxPages })
            if (!validation.valid) {
              logger.error('Invalid PageBreakV2 - skipping episode', { jobId, episode: ep, issues: validation.issues.slice(0, 5) })
              continue
            }
            const rawPanels = parsedObj.panels as LoosePanel[]
            const { normalized: normalizedPanels, report } = normalizePlanPanels(rawPanels)
            if (validation.needsNormalization || report.wasNormalized) {
              logger.warn('PageBreakV2 panels normalized due to out-of-range page numbers', { jobId, episode: ep, uniquePages: report.uniqueCount, limitedTo: report.limitedTo, maxCap: appConfig.rendering.limits.maxPages })
            }
            const panelsFull: PageBreakV2['panels'] = normalizedPanels.map((p) => ({
              pageNumber: p.pageNumber,
              panelIndex: p.panelIndex ?? 1,
              content: p.content ?? '',
              dialogue: p.dialogue ?? [],
              sfx: p.sfx ?? [],
            })) as PageBreakV2['panels']
            const pageBreakPlan: PageBreakV2 = { panels: panelsFull }
            const { renderFromPageBreakPlan } = await import('@/services/application/render')
            const result = await renderFromPageBreakPlan(jobId, ep, pageBreakPlan, ports, { skipExisting: false, concurrency: 3 })
            totalPagesProcessed += result.renderedPages
            logger.info(`レンダリング完了: EP${ep}`, { jobId, episode: ep, renderedPages: result.renderedPages, totalPages: result.totalPages, progress: `${totalPagesProcessed}/${totalPagesExpected}` })
          } else {
            logger.warn('Layout JSON is neither MangaLayout nor valid PageBreakV2; skipping', { jobId, episode: ep, keys: Object.keys(parsed || {}) })
          }
        }

        logger.info('PageBreakPlan rendering completed for all episodes', { jobId })
        return { success: true, data: { rendered: true } }
      } catch (renderError) {
        const errorMessage = renderError instanceof Error ? renderError.message : String(renderError)
        logger.error('PageBreakPlan rendering failed', { jobId, error: errorMessage, stack: renderError instanceof Error ? renderError.stack : undefined })
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Rendering step failed', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
