export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getChunkRepository } from '@/repositories'
import { JobProgressService } from '@/services/application/job-progress'
import { getDatabaseService } from '@/services/db-factory'
import { ApiError, extractErrorMessage } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'
import { validateJobId } from '@/utils/validators'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const params = await ctx.params
    // jobId validation (共通ユーティリティ)
    validateJobId(params.jobId)

    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/status',
      method: 'GET',
      jobId: params.jobId,
    })
    logger.info('Fetching job status')
    const startTime = Date.now()

    const jobProgressService = new JobProgressService()
    const job = await jobProgressService.getJobWithProgress(params.jobId)

    const duration = Date.now() - startTime
    logger.info('Database query completed', { durationMs: duration })
    logger.info('Job result', {
      found: !!job,
      details: job ? { id: job.id, status: job.status } : null,
    })

    if (!job) {
      logger.warn('Job not found in database')
      throw new ApiError('ジョブが見つかりません', 404, 'NOT_FOUND')
    }

    // 完了条件はレンダリング完了のみ（UIと厳密に同期させる）
    // フォールバック: totalPages > 0 かつ perEpisodeのrendered合計 >= totalPages なら完了とみなす
    let derivedCompleted = false
    try {
      const total = Number(job.totalPages || 0)
      if (total > 0) {
        const perEp =
          job.progress && typeof job.progress === 'object'
            ? (job.progress as Record<string, unknown>).perEpisodePages
            : undefined
        let renderedSum = Number(job.renderedPages || 0)
        if (perEp && typeof perEp === 'object') {
          const values = Object.values(perEp as Record<string | number, unknown>)
          renderedSum = values.reduce<number>((acc, v) => {
            const r = (v as { rendered?: unknown })?.rendered
            return acc + (typeof r === 'number' ? r : 0)
          }, 0)
        }
        derivedCompleted = renderedSum >= total
      }
    } catch {
      // フォールバック計算失敗時は無視（既存ロジックに委ねる）
    }

    const isCompleted = job.renderCompleted === true || derivedCompleted

    // 旧テスト互換: DB のチャンク内容をレスポンスに含める
    const chunkRepo = getChunkRepository()
    const chunks = await chunkRepo.getByJobId(job.id)

    // レンダリング未完了なのにDBが completed を示している場合、APIでは processing として扱う
    const effectiveStatus = isCompleted
      ? 'completed'
      : job.status === 'completed'
        ? 'processing'
        : job.status

    // currentStep が complete でもレンダリング未完了なら render フェーズに巻き戻して見せる
    const effectiveStep = isCompleted
      ? 'complete'
      : job.currentStep === 'complete' && !job.renderCompleted
        ? job.layoutCompleted
          ? 'render'
          : job.currentStep
        : job.currentStep

    // ベストエフォート自己修復: APIアクセス時に完了が導出されたらDBも更新
    if (derivedCompleted && !job.renderCompleted) {
      try {
        const db = getDatabaseService()
        // render完了フラグとステータス/ステップを確定
        await db.markJobStepCompleted(job.id, 'render')
        await db.updateJobStep(job.id, 'complete')
        await db.updateJobStatus(job.id, 'completed')
        logger.info('Self-healed job completion state based on derived render progress')
      } catch (e) {
        logger.warn('Failed to self-heal job completion state', { error: extractErrorMessage(e) })
      }
    }

    const res = ApiResponder.success({
      job: {
        id: job.id,
        status: effectiveStatus,
        currentStep: effectiveStep,
        splitCompleted: job.splitCompleted ?? false,
        analyzeCompleted: job.analyzeCompleted ?? false,
        episodeCompleted: job.episodeCompleted ?? false,
        layoutCompleted: job.layoutCompleted ?? false,
        // フォールバック完了を反映（DB未更新でもUIに完了を返す）
        renderCompleted: (job.renderCompleted ?? false) || derivedCompleted,
        processedChunks: job.processedChunks ?? 0,
        totalChunks: job.totalChunks ?? 0,
        processedEpisodes: job.processedEpisodes ?? 0,
        totalEpisodes: job.totalEpisodes ?? 0,
        renderedPages: job.renderedPages ?? 0,
        totalPages: job.totalPages ?? 0,
        lastError: job.lastError,
        lastErrorStep: job.lastErrorStep,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      // 互換レスポンス
      chunks: Array.isArray(chunks)
        ? chunks
            .map((c: unknown) => {
              // Narrow unknown to expected legacy row shape safely
              const isChunkRow = (
                x: unknown,
              ): x is {
                chunkIndex?: unknown
                chunk_index?: unknown
                text?: unknown
              } =>
                typeof x === 'object' &&
                x !== null &&
                ('chunkIndex' in (x as Record<string, unknown>) ||
                  'chunk_index' in (x as Record<string, unknown>) ||
                  'text' in (x as Record<string, unknown>))

              if (!isChunkRow(c)) return null

              const rawIndex =
                (c as Record<string, unknown>).chunkIndex ??
                (c as Record<string, unknown>).chunk_index
              const idx = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex)
              const textVal = (c as Record<string, unknown>).text
              return {
                chunkIndex: Number.isFinite(idx) ? (idx as number) : 0,
                text: typeof textVal === 'string' ? textVal : '',
              }
            })
            .filter((v): v is { chunkIndex: number; text: string } => v !== null)
        : [],
    })
    // 明示的にキャッシュ無効化（ブラウザ/中間キャッシュ対策）
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (error) {
    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/status',
      method: 'GET',
    })
    logger.error('Error fetching job status', {
      error: extractErrorMessage(error),
    })
    // テスト期待: data.error は常に 'Failed to fetch job status'、詳細には元エラー
    if (error instanceof ApiError) {
      // NOT_FOUND や VALIDATION はそのまま返却
      if (error.statusCode === 404 || error.statusCode === 400) {
        return ApiResponder.error(error)
      }
    }
    // それ以外はメッセージ固定
    const causeMessage = extractErrorMessage(error)
    // テスト互換: エラーメッセージ固定 & details 文字列
    return ApiResponder.error(
      new ApiError('Failed to fetch job status', 500, 'INTERNAL_ERROR', causeMessage),
    )
  }
}
