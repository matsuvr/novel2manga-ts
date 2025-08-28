import yaml from 'js-yaml'
import { appConfig } from '@/config/app.config'
import { getRandomPanelLayout } from '@/data/panel-layout-samples'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { getDatabaseService } from '@/services/db-factory'
import type { PageBreakPlan } from '@/types/script'
import { normalizeAndValidateLayout } from '@/utils/layout-normalizer'
// YAML依存を排除: 直接JSONのMangaLayoutを構築して使用する

export interface BatchOptions {
  concurrency?: number
  skipExisting?: boolean
}

export interface BatchResultItem {
  pageNumber: number
  status: 'success' | 'skipped' | 'failed'
  renderKey?: string
  thumbnailKey?: string
  error?: string
  fileSize?: number
  renderedAt?: string
}

export interface BatchRenderResult {
  success: boolean
  jobId: string
  episodeNumber: number
  totalPages: number
  renderedPages: number
  skippedPages: number
  failedPages: number
  results: BatchResultItem[]
  duration: number
}

// 互換APIは維持せず、JSONレイアウト経路のみ使用します。
export async function renderBatchFromJson(
  jobId: string,
  episodeNumber: number,
  mangaLayoutJson: unknown,
  pages?: number[],
  options: BatchOptions = {},
  ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({ jobId, episodeNumber, service: 'render' }),
): Promise<BatchRenderResult> {
  const startTime = Date.now()
  const dbService = getDatabaseService()

  // layoutはJSONとして渡される前提
  const parsedLayout = mangaLayoutJson as Parameters<typeof normalizeAndValidateLayout>[0]
  // normalize and auto-fix overlaps/gaps using embedded references
  const { layout: mangaLayout, pageIssues } = normalizeAndValidateLayout(parsedLayout)
  if (Object.values(pageIssues).some((issues) => issues.length > 0)) {
    logger.warn('Layout issues detected and normalized', { pageIssues })
  }
  const allPages = mangaLayout.pages.map((p) => p.page_number)
  const targetPages = pages && pages.length > 0 ? pages : allPages
  const validPages = targetPages.filter((p) => allPages.includes(p))

  const renderer = await MangaPageRenderer.create({
    pageWidth: appConfig.rendering.defaultPageSize.width,
    pageHeight: appConfig.rendering.defaultPageSize.height,
    margin: 20,
    panelSpacing: 10,
    defaultFont: 'sans-serif',
    fontSize: 14,
  })

  const storage = ports.render
  const results: BatchResultItem[] = []
  let renderedCount = 0
  const skippedCount = 0
  let failedCount = 0

  async function renderPage(pageNumber: number) {
    // skip existing
    // skipExisting not supported for now (no read API on render port); keep behavior by not skipping

    const targetPage = mangaLayout.pages.find((p) => p.page_number === pageNumber)
    if (!targetPage) {
      results.push({ pageNumber, status: 'failed', error: 'Page not found in layout' })
      failedCount++
      return
    }

    try {
      // 事前検証: パネルの存在とサイズ
      const panels = targetPage.panels || []
      if (panels.length === 0) {
        throw new Error(`Page ${pageNumber} has no panels in layout`)
      }
      const invalid = panels.filter((p) => !p || p.size.width <= 0 || p.size.height <= 0)
      if (invalid.length > 0) {
        throw new Error(
          `Page ${pageNumber} contains zero-size panels: ${invalid
            .map((p) => String(p.id))
            .join(', ')}`,
        )
      }

      const imageBlob = await renderer.renderToImage(mangaLayout, pageNumber, 'png')
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())

      const renderKey = await storage.putPageRender(jobId, episodeNumber, pageNumber, imageBuffer)

      const thumbBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, {
        width: 200,
        height: 280,
        quality: 0.8,
        format: 'jpeg',
      })
      const thumbnailBuffer = Buffer.from(await thumbBlob.arrayBuffer())
      const thumbnailKey = await storage.putPageThumbnail(
        jobId,
        episodeNumber,
        pageNumber,
        thumbnailBuffer,
      )

      await dbService.updateRenderStatus(jobId, episodeNumber, pageNumber, {
        isRendered: true,
        imagePath: renderKey,
        thumbnailPath: thumbnailKey,
        width: appConfig.rendering.defaultPageSize.width,
        height: appConfig.rendering.defaultPageSize.height,
        fileSize: imageBuffer.length,
      })

      results.push({
        pageNumber,
        status: 'success',
        renderKey,
        thumbnailKey,
        fileSize: imageBuffer.length,
        renderedAt: new Date().toISOString(),
      })
      renderedCount++
    } catch (err) {
      logger.error('renderPage failed', { pageNumber, error: (err as Error).message })
      results.push({ pageNumber, status: 'failed', error: (err as Error).message })
      failedCount++
    }
  }

  const conc = Math.max(1, options.concurrency ?? 3)
  const chunks: number[][] = []
  for (let i = 0; i < validPages.length; i += conc) {
    chunks.push(validPages.slice(i, i + conc))
  }
  try {
    for (const chunk of chunks) {
      await Promise.all(chunk.map(renderPage))
    }
  } finally {
    renderer.cleanup()
  }

  const duration = Date.now() - startTime

  return {
    success: true,
    jobId,
    episodeNumber,
    totalPages: validPages.length,
    renderedPages: renderedCount,
    skippedPages: skippedCount,
    failedPages: failedCount,
    results,
    duration,
  }
}

// Panel layout sample loader functions (bundled at build time)

// Utility function to convert Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return buffer.toString('base64')
}

// getRandomPanelLayout is provided by the bundled data module

// PageBreakPlan based rendering function
export async function renderFromPageBreakPlan(
  jobId: string,
  episodeNumber: number,
  pageBreakPlan: PageBreakPlan,
  ports: StoragePorts,
  options: BatchOptions = {},
): Promise<{
  success: boolean
  jobId: string
  episodeNumber: number
  totalPages: number
  renderedPages: number
  skippedPages: number
  failedPages: number
  results: BatchResultItem[]
  duration: number
}> {
  const logger = getLogger().withContext({
    service: 'render',
    method: 'renderFromPageBreakPlan',
    jobId,
    episodeNumber,
  })

  const startTime = Date.now()
  const results: BatchResultItem[] = []
  let renderedCount = 0
  let skippedCount = 0
  let failedCount = 0

  logger.info('Starting pageBreakPlan based rendering', {
    totalPages: pageBreakPlan.pages.length,
  })

  // Initialize renderer with proper async initialization
  const renderer = await MangaPageRenderer.create({
    pageWidth: appConfig.rendering.defaultPageSize.width,
    pageHeight: appConfig.rendering.defaultPageSize.height,
    margin: 20,
    panelSpacing: 10,
    defaultFont: 'Arial',
    fontSize: 12,
  })

  try {
    for (const page of pageBreakPlan.pages) {
      try {
        // Check if page already exists
        if (options.skipExisting) {
          const existingImage = await ports.render.getPageRender(
            jobId,
            episodeNumber,
            page.pageNumber,
          )
          if (existingImage) {
            logger.debug('Skipping existing page', { pageNumber: page.pageNumber })
            skippedCount++
            results.push({
              pageNumber: page.pageNumber,
              status: 'skipped',
            })
            continue
          }
        }

        // Get random panel layout for this page's panel count
        const panelLayout = getRandomPanelLayout(page.panelCount)

        // Create layout data by combining panel layout with page content
        const layoutData = {
          page_number: page.pageNumber,
          panels: page.panels.map((panel, index) => {
            const layoutPanel = panelLayout.panels[index]
            const [x, y, width, height] = layoutPanel.bbox
            return {
              id: panel.panelIndex,
              position: { x, y },
              size: { width, height },
              content: panel.content,
              dialogues: panel.dialogue.map((d) => ({
                text:
                  (d as { text?: string; lines?: string }).text ??
                  (d as { lines?: string }).lines ??
                  '',
                speaker: d.speaker,
                type: 'speech' as const,
              })),
            }
          }),
        }

        // 直接MangaLayout JSONを構築
        const parsed = {
          title: `Episode ${episodeNumber}`,
          created_at: new Date().toISOString(),
          episodeNumber: episodeNumber,
          pages: [layoutData],
        } as Parameters<typeof normalizeAndValidateLayout>[0]
        const { layout, pageIssues } = normalizeAndValidateLayout(parsed)
        if (Object.values(pageIssues).some((issues) => issues.length > 0)) {
          logger.warn('Normalized layout for page due to issues', {
            pageNumber: page.pageNumber,
            pageIssues,
          })
        }

        // Render the page using the existing renderer
        const imageBlob = await renderer.renderToImage(layout, page.pageNumber, 'png')
        const base64Image = await blobToBase64(imageBlob)

        // Generate thumbnail
        const imageBlobForThumbnail = new Blob([Buffer.from(base64Image, 'base64')], {
          type: 'image/png',
        })
        const thumbnailBlob = await ThumbnailGenerator.generateThumbnail(imageBlobForThumbnail, {
          width: 200,
          height: 280,
          quality: 0.8,
        })
        const thumbnailBase64 = await blobToBase64(thumbnailBlob)

        // Store the rendered images
        const renderKey = await ports.render.putPageRender(
          jobId,
          episodeNumber,
          page.pageNumber,
          Buffer.from(base64Image, 'base64'),
        )

        const thumbnailKey = await ports.render.putPageThumbnail(
          jobId,
          episodeNumber,
          page.pageNumber,
          Buffer.from(thumbnailBase64, 'base64'),
        )

        // Update render status in database
        const db = getDatabaseService()
        await db.updateRenderStatus(jobId, episodeNumber, page.pageNumber, {
          isRendered: true,
          imagePath: renderKey,
          thumbnailPath: thumbnailKey,
          width: appConfig.rendering.defaultPageSize.width,
          height: appConfig.rendering.defaultPageSize.height,
          fileSize: Buffer.from(base64Image, 'base64').length,
        })

        renderedCount++
        results.push({
          pageNumber: page.pageNumber,
          status: 'success',
          renderKey,
          thumbnailKey,
          fileSize: Buffer.from(base64Image, 'base64').length,
        })

        logger.debug('Page rendered successfully', {
          pageNumber: page.pageNumber,
          panelCount: page.panelCount,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Failed to render page', {
          pageNumber: page.pageNumber,
          error: errorMessage,
        })

        failedCount++
        results.push({
          pageNumber: page.pageNumber,
          status: 'failed',
          error: errorMessage,
        })
      }
    }
  } finally {
    renderer.cleanup()
  }

  const duration = Date.now() - startTime

  logger.info('PageBreakPlan rendering completed', {
    totalPages: pageBreakPlan.pages.length,
    renderedPages: renderedCount,
    skippedPages: skippedCount,
    failedPages: failedCount,
    duration,
  })

  return {
    success: true,
    jobId,
    episodeNumber,
    totalPages: pageBreakPlan.pages.length,
    renderedPages: renderedCount,
    skippedPages: skippedCount,
    failedPages: failedCount,
    results,
    duration,
  }
}

// Backward-compatible wrapper: accept YAML or JSON text, parse safely, then delegate to JSON renderer
export async function renderBatchFromYaml(
  jobId: string,
  episodeNumber: number,
  layoutYaml: string,
  pages?: number[],
  options: BatchOptions = {},
  ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({ jobId, episodeNumber, service: 'render' }),
): Promise<BatchRenderResult> {
  let parsed: unknown
  // Try YAML first; if it fails, try JSON.parse for historical JSON storage
  try {
    parsed = yaml.load(layoutYaml) as unknown
  } catch {
    try {
      parsed = JSON.parse(layoutYaml) as unknown
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Failed to parse layout text as YAML/JSON', { error: msg })
      throw new Error(`Invalid layout text: ${msg}`)
    }
  }
  return renderBatchFromJson(jobId, episodeNumber, parsed, pages, options, ports, logger)
}
