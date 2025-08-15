import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { renderBatchFromYaml } from '@/services/application/render'
import { getDatabaseService } from '@/services/db-factory'
import { ApiResponder } from '@/utils/api-responder'
import { validateJobId } from '@/utils/validators'
import { appConfig } from '@/config/app.config'

interface RenderRequest {
  jobId: string
  episodeNumber: number
  pageNumber: number
  layoutYaml: string
}

export async function POST(request: NextRequest) {
  try {
    const _logger = getLogger().withContext({
      route: 'api/render',
      method: 'POST',
    })
    const body = (await request.json()) as Partial<RenderRequest>

    // 入力バリデーション
    if (!body.jobId) return ApiResponder.validation('jobIdが必要です')
    validateJobId(body.jobId)
    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1)
      return ApiResponder.validation('有効なepisodeNumberが必要です')
    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1)
      return ApiResponder.validation('有効なpageNumberが必要です')
    // layoutYaml が未指定ならストレージポートから取得
    let layoutYaml = body.layoutYaml
    if (!layoutYaml) {
      const ports = getStoragePorts()
      const text = await ports.layout.getEpisodeLayout(body.jobId, body.episodeNumber)
      if (!text) return ApiResponder.validation('layoutYamlが必要です')
      layoutYaml = text
    }

    // DBチェック
    const dbService = getDatabaseService()
    const { episode: episodePort, job: jobPort } = adaptAll(dbService)
    const episodeRepo = new EpisodeRepository(episodePort)
    const jobRepo = new JobRepository(jobPort)
    const job = await jobRepo.getJob(body.jobId)
    if (!job) return ApiResponder.validation('指定されたジョブが見つかりません')
    const episodes = await episodeRepo.getByJobId(body.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === body.episodeNumber)
    if (!targetEpisode)
      return ApiResponder.validation(`エピソード ${body.episodeNumber} が見つかりません`)

    // サービスに委譲（単ページでもバッチAPIを活用）
    const result = await renderBatchFromYaml(
      body.jobId,
      body.episodeNumber,
      layoutYaml,
      [body.pageNumber],
      { concurrency: 1 },
    )
    const first = result.results[0]
    if (!first || first.status !== 'success') {
      return ApiResponder.error(new Error(first?.error || 'レンダリングに失敗しました'))
    }
    return ApiResponder.success(
      {
        success: true,
        renderKey: first.renderKey,
        thumbnailKey: first.thumbnailKey,
        message: 'ページのレンダリングが完了しました',
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
        fileSize: first.fileSize,
        dimensions: { 
          width: appConfig.rendering.defaultPageSize.width, 
          height: appConfig.rendering.defaultPageSize.height 
        },
        renderedAt: first.renderedAt,
      },
      201,
    )
  } catch (error) {
    return ApiResponder.error(error)
  }
}
