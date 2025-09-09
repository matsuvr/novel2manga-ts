import type { NextRequest } from 'next/server'
import { appConfig } from '@/config/app.config'
import type { Episode } from '@/db/schema'
import { getLogger, runWithLogContext } from '@/infrastructure/logging/logger'
import { db } from '@/services/database/index'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  ValidationError,
} from '@/utils/api-error'
import { getLayoutStorage, StorageFactory } from '@/utils/storage'
import { StorageKeys } from '@/utils/storage-keys'
import { validateJobId } from '@/utils/validators'

export async function GET(
  request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  const logger = getLogger().withContext({ route: 'api/render/status/[jobId]', method: 'GET' })
  return runWithLogContext({ muteConsole: true, route: 'api/render/status/[jobId]' }, async () => {
    try {
      const params = await ctx.params
      validateJobId(params?.jobId)
      const { searchParams } = new URL(request.url)
      const episodeParam = searchParams.get('episode')
      const pageParam = searchParams.get('page')

      // ジョブの存在確認
      const job = await db.jobs().getJob(params.jobId)
      if (!job) {
        throw new ApiError('Job not found', 404, 'NOT_FOUND')
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
      let episodes = await db.episodes().getEpisodesByJobId(params.jobId)
      // Fallback: derive episodes from layout storage (JSON files) when DB has none
      if (episodes.length === 0) {
        try {
          const storage = await StorageFactory.getLayoutStorage()
          const keys = (await storage.list?.(params.jobId)) || []
          const epNums = Array.from(
            new Set(
              keys
                .map((k) => {
                  const m = k.match(/episode_(\d+)\.json$/)
                  return m ? Number(m[1]) : undefined
                })
                .filter((n): n is number => typeof n === 'number' && Number.isFinite(n)),
            ),
          ).sort((a, b) => a - b)
          episodes = epNums.map(
            (n) =>
              ({
                id: `${params.jobId}-${n}`,
                novelId: 'unknown',
                jobId: params.jobId,
                episodeNumber: n,
                title: `エピソード${n}`,
                summary: null,
                startChunk: 0,
                startCharIndex: 0,
                endChunk: 0,
                endCharIndex: 0,
                confidence: 1,
                episodeTextPath: null,
                createdAt: new Date().toISOString(),
              }) satisfies Episode,
          )
        } catch {
          // keep empty
        }
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

        // Get actual pages from layout data
        const storage = await getLayoutStorage()
        const layoutKey = StorageKeys.episodeLayout(params.jobId, episode.episodeNumber)

        let totalPages: number
        try {
          const layoutData = await storage.get(layoutKey)
          if (!layoutData) {
            throw new ApiError(
              `Layout data not found for episode ${episode.episodeNumber}`,
              404,
              'NOT_FOUND',
            )
          }
          const layout = JSON.parse(layoutData.text)
          if (!layout.pages || !Array.isArray(layout.pages)) {
            throw new ApiError(
              `Invalid layout data for episode ${episode.episodeNumber}`,
              500,
              'INVALID_STATE',
            )
          }
          totalPages = layout.pages.length
        } catch (error) {
          if (error instanceof ApiError) {
            throw error
          }
          throw new ApiError(
            `Failed to load layout for episode ${episode.episodeNumber}: ${error instanceof Error ? error.message : String(error)}`,
            500,
            'STORAGE_ERROR',
          )
        }

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
              width: isRendered ? appConfig.rendering.defaultPageSize.width : undefined,
              height: isRendered ? appConfig.rendering.defaultPageSize.height : undefined,
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

      const response = createSuccessResponse({
        jobId: params.jobId,
        status: 'success',
        renderStatus,
        totalEpisodes: episodes.length,
        filteredEpisodes: renderStatus.length,
        filteredPages: renderStatus.reduce((total, episode) => total + episode.pages.length, 0),
      })
      logger.info('Render status fetched', {
        jobId: params.jobId,
        totalEpisodes: episodes.length,
        filteredEpisodes: renderStatus.length,
      })
      return response
    } catch (error) {
      logger.error('Error fetching render status', {
        error: error instanceof Error ? error.message : String(error),
      })
      return createErrorResponse(error, 'Failed to fetch render status')
    }
  })
}
