import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/services/database'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'

interface RenderStatusParams {
  jobId: string
}

interface RenderStatusQuery {
  episodeNumber?: string
  pageNumber?: string
}

export async function GET(request: NextRequest, { params }: { params: RenderStatusParams }) {
  try {
    const { jobId } = params
    const { searchParams } = new URL(request.url)

    if (!jobId) {
      return validationError('jobIdが必要です')
    }

    const episodeNumber = searchParams.get('episodeNumber')
    const pageNumber = searchParams.get('pageNumber')

    const dbService = new DatabaseService()

    // ジョブの存在確認
    const job = await dbService.getJob(jobId)
    if (!job) {
      return validationError('指定されたジョブが見つかりません')
    }

    // 特定のページの状態を取得
    if (episodeNumber && pageNumber) {
      const episodeNum = parseInt(episodeNumber, 10)
      const pageNum = parseInt(pageNumber, 10)

      if (isNaN(episodeNum) || isNaN(pageNum)) {
        return validationError('無効なエピソード番号またはページ番号です')
      }

      const status = await dbService.getRenderStatus(jobId, episodeNum, pageNum)

      return successResponse({
        jobId,
        episodeNumber: episodeNum,
        pageNumber: pageNum,
        status: status || {
          isRendered: false,
          message: 'レンダリング状態が見つかりません',
        },
      })
    }

    // エピソード全体の状態を取得
    if (episodeNumber) {
      const episodeNum = parseInt(episodeNumber, 10)

      if (isNaN(episodeNum)) {
        return validationError('無効なエピソード番号です')
      }

      const statuses = await dbService.getRenderStatusByEpisode(jobId, episodeNum)
      const summary = {
        totalPages: statuses.length,
        renderedPages: statuses.filter((s) => s.isRendered).length,
        failedPages: statuses.filter((s) => s.lastError).length,
        completionRate:
          statuses.length > 0
            ? Math.round((statuses.filter((s) => s.isRendered).length / statuses.length) * 100)
            : 0,
      }

      return successResponse({
        jobId,
        episodeNumber: episodeNum,
        summary,
        pages: statuses.map((status) => ({
          pageNumber: status.pageNumber,
          isRendered: status.isRendered,
          imagePath: status.imagePath,
          thumbnailPath: status.thumbnailPath,
          fileSize: status.fileSize,
          renderedAt: status.renderedAt,
          error: status.lastError,
        })),
      })
    }

    // ジョブ全体の統計を取得
    const allStatuses = await dbService.getAllRenderStatusByJob(jobId)
    const episodes = await dbService.getEpisodesByJobId(jobId)

    const episodeSummaries = episodes.map((episode) => {
      const episodeStatuses = allStatuses.filter((s) => s.episodeNumber === episode.episodeNumber)
      return {
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
        totalPages: episodeStatuses.length,
        renderedPages: episodeStatuses.filter((s) => s.isRendered).length,
        failedPages: episodeStatuses.filter((s) => s.lastError).length,
        completionRate:
          episodeStatuses.length > 0
            ? Math.round(
                (episodeStatuses.filter((s) => s.isRendered).length / episodeStatuses.length) * 100,
              )
            : 0,
      }
    })

    const overallSummary = {
      totalEpisodes: episodes.length,
      totalPages: allStatuses.length,
      renderedPages: allStatuses.filter((s) => s.isRendered).length,
      failedPages: allStatuses.filter((s) => s.lastError).length,
      completionRate:
        allStatuses.length > 0
          ? Math.round((allStatuses.filter((s) => s.isRendered).length / allStatuses.length) * 100)
          : 0,
    }

    return successResponse({
      jobId,
      job: {
        id: job.id,
        jobName: job.jobName,
        status: job.status,
        renderCompleted: job.renderCompleted,
        updatedAt: job.updatedAt,
      },
      summary: overallSummary,
      episodes: episodeSummaries,
    })
  } catch (error) {
    console.error('Render status API error:', error)
    return handleApiError(error)
  }
}
