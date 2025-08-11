import { load as yamlLoad } from 'js-yaml'
import type { NextRequest } from 'next/server'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { MangaLayout } from '@/types/panel-layout'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'
import { isMangaLayout } from '@/utils/type-guards'
import { validateJobId } from '@/utils/validators'

interface BatchRenderRequest {
  jobId: string
  episodeNumber: number
  layoutYaml: string
  pages?: number[] // 指定がない場合は全ページ
  options?: {
    concurrency?: number // 同時実行数（デフォルト: 3）
    skipExisting?: boolean // 既存のレンダリング済みページをスキップ（デフォルト: false）
  }
}

interface BatchRenderResult {
  success: boolean
  jobId: string
  episodeNumber: number
  totalPages: number
  renderedPages: number
  skippedPages: number
  failedPages: number
  results: Array<{
    pageNumber: number
    status: 'success' | 'skipped' | 'failed'
    renderKey?: string
    thumbnailKey?: string
    error?: string
    fileSize?: number
    renderedAt?: string
  }>
  duration: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = (await request.json()) as Partial<BatchRenderRequest>

    // バリデーション
    if (!body.jobId) return validationError('jobIdが必要です')
    validateJobId(body.jobId)

    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1) {
      return validationError('有効なepisodeNumberが必要です')
    }

    if (!body.layoutYaml) {
      return validationError('layoutYamlが必要です')
    }

    // バリデーション後に型アサーション
    const validatedBody = body as Required<
      Pick<BatchRenderRequest, 'jobId' | 'episodeNumber' | 'layoutYaml'>
    > &
      Partial<BatchRenderRequest>

    // YAMLをパース
    let mangaLayout: MangaLayout
    try {
      const parsed = yamlLoad(validatedBody.layoutYaml)
      if (!isMangaLayout(parsed)) return validationError('無効なYAML形式です')
      mangaLayout = parsed
    } catch (_error) {
      return validationError('無効なYAML形式です')
    }

    // マンガレイアウトの検証
    if (!mangaLayout || typeof mangaLayout !== 'object') {
      return validationError('無効なYAML形式です')
    }
    if (!('pages' in mangaLayout)) {
      return validationError('レイアウトにpages配列が必要です')
    }
    if (!Array.isArray(mangaLayout.pages)) {
      return validationError('レイアウトにpages配列が必要です')
    }

    // データベースサービスの初期化
    const dbService = getDatabaseService()
    const episodeRepo = new EpisodeRepository(dbService)
    const jobRepo = new JobRepository(dbService)

    // ジョブの存在確認（メソッドがある場合のみチェック）
    const job = await jobRepo.getJob(validatedBody.jobId)
    if (!job) {
      return validationError('指定されたジョブが見つかりません')
    }

    // エピソードの存在確認（メソッドがある場合のみチェック）
    const episodes = await episodeRepo.getByJobId(validatedBody.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === validatedBody.episodeNumber)
    if (!targetEpisode) {
      return validationError(`エピソード ${validatedBody.episodeNumber} が見つかりません`)
    }

    // レンダリング対象ページの決定
    const targetPages = validatedBody.pages || mangaLayout.pages.map((p) => p.page_number)
    const validPages = targetPages.filter((pageNum) =>
      mangaLayout.pages.some((p) => p.page_number === pageNum),
    )

    if (validPages.length === 0) {
      return validationError('有効なページが見つかりません')
    }

    // オプション設定
    const options = {
      concurrency: Math.min(validatedBody.options?.concurrency || 3, 5), // 最大5並列
      skipExisting: validatedBody.options?.skipExisting || false,
    }

    console.log(
      `バッチレンダリング開始: Job ${validatedBody.jobId}, Episode ${
        validatedBody.episodeNumber
      }, Pages: ${validPages.join(', ')}`,
    )

    // Canvas描画の準備
    const renderer = new MangaPageRenderer({
      pageWidth: 842, // A4横
      pageHeight: 595, // A4横
      margin: 20,
      panelSpacing: 10,
      defaultFont: 'sans-serif',
      fontSize: 14,
    })

    const renderStorage = await StorageFactory.getRenderStorage()
    const results: BatchRenderResult['results'] = []

    let renderedCount = 0
    let skippedCount = 0
    let failedCount = 0

    // 並列処理でページをレンダリング
    const renderPage = async (pageNumber: number) => {
      try {
        // 既存チェック
        if (options.skipExisting) {
          const renderKey = `renders/${validatedBody.jobId}/episode_${validatedBody.episodeNumber}/page_${pageNumber}.png`
          const exists = await renderStorage.exists(renderKey)
          if (exists) {
            results.push({
              pageNumber,
              status: 'skipped',
              renderKey,
            })
            skippedCount++
            return
          }
        }

        console.log(`ページ ${pageNumber} レンダリング開始`)

        // ページレンダリング
        const imageBlob = await renderer.renderToImage(mangaLayout, pageNumber, 'png')
        const buffer = Buffer.from(await imageBlob.arrayBuffer())

        // 画像保存
        const renderKey = `renders/${validatedBody.jobId}/episode_${validatedBody.episodeNumber}/page_${pageNumber}.png`
        await renderStorage.put(renderKey, buffer, {
          contentType: 'image/png',
          jobId: validatedBody.jobId,
          episodeNumber: validatedBody.episodeNumber.toString(),
          pageNumber: pageNumber.toString(),
        })

        // サムネイル生成
        const thumbnailBlob = await ThumbnailGenerator.generateThumbnail(imageBlob, {
          width: 200,
          height: 280,
          quality: 0.8,
          format: 'jpeg',
        })
        const thumbnailBuffer = Buffer.from(await thumbnailBlob.arrayBuffer())
        const thumbnailKey = `renders/${validatedBody.jobId}/episode_${validatedBody.episodeNumber}/thumbnails/page_${pageNumber}_thumb.png`

        await renderStorage.put(thumbnailKey, thumbnailBuffer, {
          contentType: 'image/jpeg',
          jobId: validatedBody.jobId,
          episodeNumber: validatedBody.episodeNumber.toString(),
          pageNumber: pageNumber.toString(),
          type: 'thumbnail',
        })

        // データベース更新
        await dbService.updateRenderStatus(
          validatedBody.jobId,
          validatedBody.episodeNumber,
          pageNumber,
          {
            isRendered: true,
            imagePath: renderKey,
            thumbnailPath: thumbnailKey,
            width: 842,
            height: 595,
            fileSize: buffer.length,
          },
        )

        results.push({
          pageNumber,
          status: 'success',
          renderKey,
          thumbnailKey,
          fileSize: buffer.length,
          renderedAt: new Date().toISOString(),
        })

        renderedCount++
        console.log(`ページ ${pageNumber} レンダリング完了`)
      } catch (error) {
        console.error(`ページ ${pageNumber} レンダリングエラー:`, error)

        results.push({
          pageNumber,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })

        failedCount++

        // エラー時のデータベース更新
        try {
          await dbService.updateRenderStatus(
            validatedBody.jobId,
            validatedBody.episodeNumber,
            pageNumber,
            {
              isRendered: false,
            },
          )
        } catch (dbError) {
          console.error(`ページ ${pageNumber} データベース更新エラー:`, dbError)
        }
      }
    }

    // 並列実行
    const chunks = []
    for (let i = 0; i < validPages.length; i += options.concurrency) {
      chunks.push(validPages.slice(i, i + options.concurrency))
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(renderPage))
    }

    // 結果をページ番号順にソート
    results.sort((a, b) => a.pageNumber - b.pageNumber)

    const duration = Date.now() - startTime
    console.log(
      `バッチレンダリング完了: ${renderedCount}成功, ${skippedCount}スキップ, ${failedCount}失敗, ${duration}ms`,
    )

    const response: BatchRenderResult = {
      success: true,
      jobId: validatedBody.jobId,
      episodeNumber: validatedBody.episodeNumber,
      totalPages: validPages.length,
      renderedPages: renderedCount,
      skippedPages: skippedCount,
      failedPages: failedCount,
      results,
      duration,
    }

    return successResponse(response, 201)
  } catch (error) {
    console.error('Batch render API error:', error)
    return handleApiError(error)
  }
}
