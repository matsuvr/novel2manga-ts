import { type NextRequest, NextResponse } from 'next/server'
import { appConfig } from '@/config/app.config'
import { DatabaseService } from '@/services/database'
import { ApiError, createErrorResponse, ValidationError } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'

export async function GET(
  request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const params = await ctx.params
    if (!params?.jobId || params.jobId === 'undefined') {
      throw new ValidationError('Invalid jobId', 'jobId')
    }
    const { searchParams } = new URL(request.url)
    const episodeParam = searchParams.get('episode')
    const pageParam = searchParams.get('page')

    const dbService = new DatabaseService()

    // ジョブの存在確認
    const job = await dbService.getJob(params.jobId)
    if (!job) {
      throw new ApiError('Job', 404)
    }

    // エピソード番号のバリデーション
    let episodeNum: number | undefined
    if (episodeParam) {
      episodeNum = Number(episodeParam)
      if (Number.isNaN(episodeNum) || episodeNum < 1) {
        throw new ValidationError('Invalid episode number', 'episode')
      }
    }

    // ページ番号のバリデーション
    let pageNum: number | undefined
    if (pageParam) {
      pageNum = Number(pageParam)
      if (Number.isNaN(pageNum) || pageNum < 1) {
        throw new ValidationError('Invalid page number', 'page')
      }
    }

    // エピソード一覧を取得
    const episodes = await dbService.getEpisodesByJobId(params.jobId)
    if (episodes.length === 0) {
      return NextResponse.json({
        jobId: params.jobId,
        status: 'no_episodes',
        renderStatus: [],
        message: 'No episodes found for this job',
      })
    }

    // 指定されたエピソードのレンダリング状態を確認
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderStatus = []

    for (const episode of episodes) {
      // エピソード番号でフィルタリング
      if (episodeNum && episode.episodeNumber !== episodeNum) {
        continue
      }

      const episodeStatus = {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        pages: [] as Array<{
          pageNumber: number
          isRendered: boolean
          imagePath?: string
          thumbnailPath?: string
          width?: number
          height?: number
          fileSize?: number
        }>,
      }

      // エピソードから実際のページ数を取得、なければ設定値をフォールバックとして使用
      const totalPages = episode.estimatedPages || appConfig.processing.episode.maxPagesPerEpisode

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        // ページ番号でフィルタリング
        if (pageNum && pageNumber !== pageNum) {
          continue
        }

        const renderKey = StorageKeys.pageRender(params.jobId, episode.episodeNumber, pageNumber)
        const thumbnailKey = StorageKeys.pageThumbnail(
          params.jobId,
          episode.episodeNumber,
          pageNumber,
        )

        try {
          // headメソッドが利用可能かチェック
          let renderInfo: {
            size?: number
            metadata?: Record<string, string>
          } | null = null
          let isRendered = false

          if (renderStorage.head) {
            renderInfo = await renderStorage.head(renderKey)
            isRendered = !!renderInfo
          } else {
            // headメソッドが利用できない場合はexistsを使用
            isRendered = await renderStorage.exists(renderKey)
          }

          episodeStatus.pages.push({
            pageNumber,
            isRendered,
            imagePath: isRendered ? renderKey : undefined,
            thumbnailPath: isRendered ? thumbnailKey : undefined,
            width: isRendered ? 842 : undefined,
            height: isRendered ? 595 : undefined,
            fileSize: isRendered ? renderInfo?.size : undefined,
          })
        } catch {
          // ファイルが存在しない場合
          episodeStatus.pages.push({
            pageNumber,
            isRendered: false,
          })
        }
      }

      renderStatus.push(episodeStatus)
    }

    return NextResponse.json({
      jobId: params.jobId,
      status: 'success',
      renderStatus,
      totalEpisodes: episodes.length,
      filteredEpisodes: renderStatus.length,
      filteredPages: renderStatus.reduce((total, episode) => total + episode.pages.length, 0),
    })
  } catch (error) {
    console.error('Error fetching render status:', error)
    return createErrorResponse(error, 'Failed to fetch render status')
  }
}
