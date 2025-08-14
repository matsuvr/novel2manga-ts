import { load as yamlLoad } from 'js-yaml'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { getDatabaseService } from '@/services/db-factory'
import type { MangaLayout } from '@/types/panel-layout'
import { isMangaLayout } from '@/utils/type-guards'

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

  // parse & validate layout
  const parsed = yamlLoad(layoutYaml)
  if (!isMangaLayout(parsed)) throw new Error('Invalid YAML layout')
  const mangaLayout = parsed as MangaLayout
  const allPages = mangaLayout.pages.map((p) => p.page_number)
  const targetPages = pages && pages.length > 0 ? pages : allPages
  const validPages = targetPages.filter((p) => allPages.includes(p))

  const renderer = new MangaPageRenderer({
    pageWidth: 842,
    pageHeight: 595,
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
        width: 842,
        height: 595,
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
  if (failedCount === 0) {
    try {
      await dbService.markJobStepCompleted(jobId, 'render')
      await dbService.updateJobStep(jobId, 'complete')
      await dbService.updateJobStatus(jobId, 'completed')
    } catch {
      // noop
    }
  }

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
