import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { renderBatchFromYaml } from '@/services/application/render'
import { getDatabaseService } from '@/services/db-factory'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'
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

// response 型はサービス関数の戻り値型に準拠

export async function POST(request: NextRequest) {
  try {
    const logger = getLogger().withContext({
      route: 'api/render/batch',
      method: 'POST',
    })
    const body = (await request.json()) as Partial<BatchRenderRequest>

    // バリデーション
    if (!body.jobId) return createErrorResponse(new ValidationError('jobIdが必要です'))
    validateJobId(body.jobId)

    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1) {
      return createErrorResponse(new ValidationError('有効なepisodeNumberが必要です'))
    }

    if (!body.layoutYaml) {
      return createErrorResponse(new ValidationError('layoutYamlが必要です'))
    }

    // バリデーション後に型アサーション
    const validatedBody = body as Required<
      Pick<BatchRenderRequest, 'jobId' | 'episodeNumber' | 'layoutYaml'>
    > &
      Partial<BatchRenderRequest>

    // データベースサービスの初期化
    const dbService = getDatabaseService()
    const { episode: episodePort, job: jobPort } = adaptAll(dbService)
    const episodeRepo = new EpisodeRepository(episodePort)
    const jobRepo = new JobRepository(jobPort)

    // ジョブの存在確認（メソッドがある場合のみチェック）
    const job = await jobRepo.getJob(validatedBody.jobId)
    if (!job) {
      return createErrorResponse(new ValidationError('指定されたジョブが見つかりません'))
    }

    // エピソードの存在確認（メソッドがある場合のみチェック）
    const episodes = await episodeRepo.getByJobId(validatedBody.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === validatedBody.episodeNumber)
    if (!targetEpisode) {
      return createErrorResponse(
        new ValidationError(`エピソード ${validatedBody.episodeNumber} が見つかりません`),
      )
    }

    const response = await renderBatchFromYaml(
      validatedBody.jobId,
      validatedBody.episodeNumber,
      validatedBody.layoutYaml,
      validatedBody.pages,
      validatedBody.options,
    )
    logger.info('Batch render completed', {
      jobId: validatedBody.jobId,
      episodeNumber: validatedBody.episodeNumber,
      rendered: response.renderedPages,
      skipped: response.skippedPages,
      failed: response.failedPages,
      duration: response.duration,
    })
    return createSuccessResponse(response, 201)
  } catch (error) {
    return createErrorResponse(error)
  }
}
