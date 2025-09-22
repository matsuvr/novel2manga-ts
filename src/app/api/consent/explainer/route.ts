import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { seedExplainerCharactersSnapshot } from '@/character/explainer-seeding'
import { buildExplainerCharsUser, EXPLAINER_CHARS_SYSTEM, getAppConfigWithOverrides, parseExplainerChars } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { BranchType } from '@/types/branch'
import { withAuth } from '@/utils/api-auth'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { saveBranchMarker } from '@/utils/branch-marker'

const schema = z.object({ jobId: z.string().min(1) })

export const POST = withAuth(async (req, user) => {
  const logger = getLogger().withContext({ route: 'api/consent/explainer', method: 'POST' })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return createErrorResponse(new ApiError('無効なJSONです', 400, 'INVALID_INPUT'))
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return createErrorResponse(new ApiError('VALIDATION_ERROR', 400, 'VALIDATION_ERROR'))
  }
  const { jobId } = parsed.data

  try {
    const job = await db.jobs().getJob(jobId)
    if (!job) return createErrorResponse(new ApiError('ジョブが存在しません', 404, 'NOT_FOUND'))
    if (job.userId && job.userId !== user.id) {
      return createErrorResponse(new ApiError('権限がありません', 403, 'FORBIDDEN'))
    }
    if (job.status !== 'paused') {
      logger.warn('Job not in paused state for explainer', { jobId, status: job.status })
    }

    const config = getAppConfigWithOverrides()
    if (!config.nonNarrative?.enabled) {
      return createErrorResponse(new ApiError('非物語分岐は無効です', 400, 'INVALID_INPUT'))
    }

    // 元テキストを取得
    const { StorageFactory } = await import('@/utils/storage')
    const novelStorage = await StorageFactory.getNovelStorage()
    const novelId = job.novelId
    const key = `${novelId}.json`
    const stored = await novelStorage.get(key)
    if (!stored) {
      return createErrorResponse(new ApiError('テキストが見つかりません', 404, 'NOT_FOUND'))
    }
    let baseText: string
    try {
      const obj = JSON.parse(stored.text)
      baseText = typeof obj.text === 'string' ? obj.text : stored.text
    } catch {
      baseText = stored.text
    }

    // 要約（短い場合はそのまま）
    const summary = baseText.slice(0, 800)

  // 分岐マーカー保存（EXPLAINER）
  await saveBranchMarker(jobId, BranchType.EXPLAINER)

  // キャラ生成
    const generator = getLlmStructuredGenerator()
    // structured-generator は JSON スキーマ必須なので汎用的 object スキーマを適用
    const JsonTextSchema = z.any()
    const WrapperSchema = z.object({ output: JsonTextSchema })
    const charJsonWrapped = await generator.generateObjectWithFallback<{ output: unknown }>({
      name: 'explainer-chars',
      systemPrompt: EXPLAINER_CHARS_SYSTEM,
      userPrompt: buildExplainerCharsUser(summary),
      schema: WrapperSchema as unknown as z.ZodType<{ output: unknown }>,
  schemaName: 'ExplainerCharsWrapper',
    })

    let characters: ReturnType<typeof parseExplainerChars>
    try {
      // 出力が { output: 'JSON文字列' } または { output: [...] } のどちらかを想定
      const raw: unknown = charJsonWrapped.output
      const jsonText = typeof raw === 'string' ? raw : JSON.stringify(raw)
      characters = parseExplainerChars(jsonText)
    } catch (e) {
      return createErrorResponse(
        new ApiError(
          'キャラクターJSON解析に失敗しました',
          500,
          'INTERNAL_ERROR',
          e instanceof Error ? e.message : String(e),
        ),
      )
    }

    if (characters.length < 2 || characters.length > 3) {
      return createErrorResponse(new ApiError('キャラ数が想定外です', 500, 'INTERNAL_ERROR'))
    }

    // スナップショット保存 (chunk0)
    await seedExplainerCharactersSnapshot(characters)

    // ジョブを再開状態に変更
    db.jobs().updateJobStatus(jobId, 'processing', 'explainer accepted')
    db.jobs().updateJobStep(jobId, 'initialized')

  // パイプライン再実行 (元テキストをそのまま使用)
  // TODO(job-queue): fire-and-forget。障害復旧性/再試行/可観測性向上のため永続ジョブキュー化予定。
  logger.warn('Explainer pipeline scheduled via fire-and-forget (non-durable). Queue migration pending.', { jobId })
    ;(async () => {
      try {
        const { AnalyzePipeline } = await import('@/services/application/analyze-pipeline')
        const pipeline = new AnalyzePipeline()
        await pipeline.runWithText(novelId, baseText, { existingJobId: jobId })
      } catch (err) {
        logger.error('Explainer pipeline run failed', {
          jobId,
            error: err instanceof Error ? err.message : String(err),
        })
        try {
          db.jobs().updateJobStatus(jobId, 'failed', err instanceof Error ? err.message : String(err))
        } catch (updateErr) {
          logger.warn('Failed to update job status after explainer pipeline error', {
            jobId,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          })
        }
      }
    })()

    return createSuccessResponse({ jobId, resumed: true, branch: 'EXPLAINER', characters })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return createErrorResponse(new ApiError(msg, 500, 'INTERNAL_ERROR'))
  }
})
