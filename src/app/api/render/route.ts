import type { NextRequest } from 'next/server'
import { parse as parseYaml } from 'yaml'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { DatabaseService } from '@/services/database'
import type { MangaLayout } from '@/types/panel-layout'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'

interface RenderRequest {
  jobId: string
  episodeNumber: number
  pageNumber: number
  layoutYaml: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<RenderRequest>

    // バリデーション
    if (!body.jobId) {
      return validationError('jobIdが必要です')
    }

    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1) {
      return validationError('有効なepisodeNumberが必要です')
    }

    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1) {
      return validationError('有効なpageNumberが必要です')
    }

    if (!body.layoutYaml) {
      return validationError('layoutYamlが必要です')
    }

    // YAMLをパース
    let mangaLayout: MangaLayout
    try {
      mangaLayout = parseYaml(body.layoutYaml) as MangaLayout
    } catch (_error) {
      return validationError('無効なYAML形式です')
    }

    // マンガレイアウトの検証
    if (!mangaLayout.pages || !Array.isArray(mangaLayout.pages)) {
      return validationError('レイアウトにpages配列が必要です')
    }

    const targetPage = mangaLayout.pages.find((p) => p.page_number === body.pageNumber)
    if (!targetPage) {
      return validationError(`ページ ${body.pageNumber} が見つかりません`)
    }

    // データベースサービスの初期化
    const dbService = new DatabaseService()

    // ジョブの存在確認
    const job = await dbService.getJob(body.jobId)
    if (!job) {
      return validationError('指定されたジョブが見つかりません')
    }

    // エピソードの存在確認
    const episodes = await dbService.getEpisodesByJobId(body.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === body.episodeNumber)
    if (!targetEpisode) {
      return validationError(`エピソード ${body.episodeNumber} が見つかりません`)
    }

    // Canvas描画の実行
    console.log(
      `レンダリング開始: Job ${body.jobId}, Episode ${body.episodeNumber}, Page ${body.pageNumber}`,
    )

    const renderer = new MangaPageRenderer({
      pageWidth: 842, // A4横
      pageHeight: 595, // A4横
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
    })

    // 指定ページをレンダリング
    const imageBlob = await renderer.renderToImage(mangaLayout, body.pageNumber, 'png')
    console.log(`画像レンダリング完了: ${imageBlob.size} bytes`)

    // Blobをバッファに変換
    const arrayBuffer = await imageBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ストレージに保存
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderKey = StorageKeys.pageRender(body.jobId, body.episodeNumber, body.pageNumber)

    await renderStorage.put(renderKey, buffer, {
      contentType: 'image/png',
      jobId: body.jobId,
      episodeNumber: body.episodeNumber.toString(),
      pageNumber: body.pageNumber.toString(),
    })
    console.log(`画像保存完了: ${renderKey}`)

    // サムネイル生成
    console.log('サムネイル生成開始')
    const thumbnailBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, {
      width: 200,
      height: 280,
      quality: 0.8,
      format: 'jpeg',
    })

    const thumbnailBuffer = Buffer.from(await thumbnailBlob.arrayBuffer())
    const thumbnailKey = StorageKeys.pageThumbnail(body.jobId, body.episodeNumber, body.pageNumber)

    await renderStorage.put(thumbnailKey, thumbnailBuffer, {
      contentType: 'image/jpeg',
      jobId: body.jobId,
      episodeNumber: body.episodeNumber.toString(),
      pageNumber: body.pageNumber.toString(),
      type: 'thumbnail',
    })
    console.log(`サムネイル保存完了: ${thumbnailKey}`)

    // レンダリング状態の更新
    await dbService.updateRenderStatus(body.jobId, body.episodeNumber, body.pageNumber, {
      isRendered: true,
      imagePath: renderKey,
      thumbnailPath: thumbnailKey,
      width: 842,
      height: 595,
      fileSize: buffer.length,
    })

    console.log(
      `レンダリング完了: Job ${body.jobId}, Episode ${body.episodeNumber}, Page ${body.pageNumber}`,
    )

    return successResponse(
      {
        success: true,
        renderKey,
        thumbnailKey,
        message: 'ページのレンダリングが完了しました',
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
        fileSize: buffer.length,
        thumbnailSize: thumbnailBuffer.length,
        dimensions: {
          width: 842,
          height: 595,
        },
        renderedAt: new Date().toISOString(),
      },
      201,
    )
  } catch (error) {
    console.error('Render API error:', error)

    // エラー時はレンダリング状態を失敗として記録
    try {
      const requestBody = (await request.json()) as Partial<RenderRequest>
      if (
        requestBody?.jobId &&
        typeof requestBody.episodeNumber === 'number' &&
        typeof requestBody.pageNumber === 'number'
      ) {
        const dbService = new DatabaseService()
        await dbService.updateRenderStatus(
          requestBody.jobId,
          requestBody.episodeNumber,
          requestBody.pageNumber,
          {
            isRendered: false,
          }
        )
      }
    } catch (dbError) {
      console.error('Failed to update render status on error:', dbError)
    }

    return handleApiError(error)
  }
}
