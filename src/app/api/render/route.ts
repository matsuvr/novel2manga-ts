import type { NextRequest } from 'next/server'
import { load as yamlLoad } from 'js-yaml'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { getDatabaseService } from '@/services/db-factory'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import type { MangaLayout } from '@/types/panel-layout'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'
import { validateJobId } from '@/utils/validators'
import { isMangaLayout } from '@/utils/type-guards'

interface RenderRequest {
  jobId: string
  episodeNumber: number
  pageNumber: number
  layoutYaml: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<RenderRequest>

    // 入力バリデーション
    if (!body.jobId) return validationError('jobIdが必要です')
    validateJobId(body.jobId)
    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1)
      return validationError('有効なepisodeNumberが必要です')
    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1)
      return validationError('有効なpageNumberが必要です')
    if (!body.layoutYaml) return validationError('layoutYamlが必要です')

    // YAMLパース
    let mangaLayout: MangaLayout
    try {
      const parsed = yamlLoad(body.layoutYaml)
      if (!isMangaLayout(parsed)) return validationError('無効なYAML形式です')
      mangaLayout = parsed
    } catch {
      return validationError('無効なYAML形式です')
    }
    if (!mangaLayout || typeof mangaLayout !== 'object')
      return validationError('無効なYAML形式です')
    if (!Array.isArray(mangaLayout.pages)) return validationError('レイアウトにpages配列が必要です')
    const targetPage = mangaLayout.pages.find((p) => p.page_number === body.pageNumber)
    if (!targetPage) return validationError(`ページ ${body.pageNumber} が見つかりません`)

    // DBチェック
    const dbService = getDatabaseService()
    const episodeRepo = new EpisodeRepository(dbService)
    const jobRepo = new JobRepository(dbService)
    const job = await jobRepo.getJob(body.jobId)
    if (!job) return validationError('指定されたジョブが見つかりません')
    const episodes = await episodeRepo.getByJobId(body.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === body.episodeNumber)
    if (!targetEpisode) return validationError(`エピソード ${body.episodeNumber} が見つかりません`)

    // Canvas描画
    const renderer = new MangaPageRenderer({
      pageWidth: 842,
      pageHeight: 595,
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
    })
    const imageBlob = await renderer.renderToImage(mangaLayout, body.pageNumber, 'png')
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())

    // 保存
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderKey = `renders/${body.jobId}/episode_${body.episodeNumber}/page_${body.pageNumber}.png`
    await renderStorage.put(renderKey, imageBuffer, {
      contentType: 'image/png',
      jobId: body.jobId,
      episodeNumber: String(body.episodeNumber),
      pageNumber: String(body.pageNumber),
    })

    // サムネイル
    const thumbBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, {
      width: 200,
      height: 280,
      quality: 0.8,
      format: 'jpeg',
    })
    const thumbnailBuffer = Buffer.from(await thumbBlob.arrayBuffer())
    const thumbnailKey = `renders/${body.jobId}/episode_${body.episodeNumber}/thumbnails/page_${body.pageNumber}_thumb.png`
    await renderStorage.put(thumbnailKey, thumbnailBuffer, {
      contentType: 'image/jpeg',
      jobId: body.jobId,
      episodeNumber: String(body.episodeNumber),
      pageNumber: String(body.pageNumber),
      type: 'thumbnail',
    })

    // ステータス更新（存在する場合）
    await dbService.updateRenderStatus(body.jobId, body.episodeNumber, body.pageNumber, {
      isRendered: true,
      imagePath: renderKey,
      thumbnailPath: thumbnailKey,
      width: 842,
      height: 595,
      fileSize: imageBuffer.length,
    })

    return successResponse(
      {
        success: true,
        renderKey,
        thumbnailKey,
        message: 'ページのレンダリングが完了しました',
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
        fileSize: imageBuffer.length,
        thumbnailSize: thumbnailBuffer.length,
        dimensions: { width: 842, height: 595 },
        renderedAt: new Date().toISOString(),
      },
      201,
    )
  } catch (error) {
    return handleApiError(error)
  }
}
