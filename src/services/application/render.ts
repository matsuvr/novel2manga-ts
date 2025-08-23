import { appConfig } from '@/config/app.config'
import { getRandomPanelLayout } from '@/data/panel-layout-samples'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { getDatabaseService } from '@/services/db-factory'
import type { PageBreakPlan } from '@/types/script'
import { parseMangaLayoutFromYaml } from '@/utils/layout-parser'

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

export async function renderBatchFromYaml(
  jobId: string,
  episodeNumber: number,
  layoutYaml: string,
  pages?: number[],
  options: BatchOptions = {},
  ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({ jobId, episodeNumber, service: 'render' }),
): Promise<BatchRenderResult> {
  const startTime = Date.now()
  const dbService = getDatabaseService()

  // parse & validate layout (supports canonical and bbox formats)
  const mangaLayout = parseMangaLayoutFromYaml(layoutYaml)
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
          panels_count: page.panelCount,
          panels: page.panels.map((panel, index) => {
            const layoutPanel = panelLayout.panels[index]
            return {
              id: panel.panelIndex,
              bbox: layoutPanel.bbox,
              content: panel.content,
              dialogue: panel.dialogue.map((d) => `${d.speaker}: ${d.lines}`).join('\n'),
            }
          }),
        }

        // Convert layout data to YAML format for compatibility with existing renderer
        const yamlContent = `page_${page.pageNumber}:
  panels_count: ${layoutData.panels_count}
  panels:
${layoutData.panels
  .map(
    (panel) =>
      `    - id: ${panel.id}
      bbox: [${panel.bbox.join(', ')}]
      content: "${panel.content.replace(/"/g, '\\"')}"
      dialogue: "${panel.dialogue.replace(/"/g, '\\"')}"`,
  )
  .join('\n')}`

        // Parse YAML content to MangaLayout
        const layout = parseMangaLayoutFromYaml(yamlContent)

        // Render the page using the existing renderer
        // Guard against potential silent hang in renderer
        logger.debug('Rendering page to image blob (start)', { pageNumber: page.pageNumber })
        const imageBlob = await withTimeout(
          renderer.renderToImage(layout, page.pageNumber, 'png'),
          30000,
          'Renderer.renderToImage timeout after 30000ms'
        )
        logger.debug('Rendering page to image blob (done)', {
          pageNumber: page.pageNumber,
          sizeHint: imageBlob.size,
        })

        // Convert to base64 (with timeout to avoid silent hang)
        logger.debug('Converting image blob to base64 (start)', { pageNumber: page.pageNumber })
        const base64Image = await Promise.race([
          blobToBase64(imageBlob),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('blobToBase64 timeout after 15000ms')), 15000),
          ),
        ])
        logger.debug('Converting image blob to base64 (done)', {
          pageNumber: page.pageNumber,
          length: base64Image.length,
        })

        // Generate thumbnail
        const imageBlobForThumbnail = new Blob([Buffer.from(base64Image, 'base64')], {
          type: 'image/png',
        })
        logger.debug('Generating thumbnail (start)', { pageNumber: page.pageNumber })
        const thumbnailBlob = await Promise.race([
          ThumbnailGenerator.generateThumbnail(imageBlobForThumbnail, {
            width: 200,
            height: 280,
            quality: 0.8,
          }),
          new Promise<Blob>((_, reject) =>
            setTimeout(
              () => reject(new Error('Thumbnail generation timeout after 10000ms')),
              10000,
            ),
          ),
        ])
        logger.debug('Generating thumbnail (done)', { pageNumber: page.pageNumber })
        const thumbnailBase64 = await blobToBase64(thumbnailBlob)

        // Store the rendered images
        logger.debug('Storing rendered image (start)', { pageNumber: page.pageNumber })
        const renderKey = await ports.render.putPageRender(
          jobId,
          episodeNumber,
          page.pageNumber,
          Buffer.from(base64Image, 'base64'),
        )
        logger.debug('Storing rendered image (done)', { pageNumber: page.pageNumber, renderKey })

        logger.debug('Storing thumbnail (start)', { pageNumber: page.pageNumber })
        const thumbnailKey = await ports.render.putPageThumbnail(
          jobId,
          episodeNumber,
          page.pageNumber,
          Buffer.from(thumbnailBase64, 'base64'),
        )
        logger.debug('Storing thumbnail (done)', { pageNumber: page.pageNumber, thumbnailKey })

        // Update render status in database
        logger.debug('Updating render status in DB (start)', { pageNumber: page.pageNumber })
        const db = getDatabaseService()
        await db.updateRenderStatus(jobId, episodeNumber, page.pageNumber, {
          isRendered: true,
          imagePath: renderKey,
          thumbnailPath: thumbnailKey,
          width: appConfig.rendering.defaultPageSize.width,
          height: appConfig.rendering.defaultPageSize.height,
          fileSize: Buffer.from(base64Image, 'base64').length,
        })
        logger.debug('Updating render status in DB (done)', { pageNumber: page.pageNumber })

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
