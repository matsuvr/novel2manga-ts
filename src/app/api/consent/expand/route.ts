import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { buildAIExpansionSystem, buildAIExpansionUser, getAppConfigWithOverrides } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { BranchType } from '@/types/branch'
import { withAuth } from '@/utils/api-auth'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { saveBranchMarker } from '@/utils/branch-marker'

// リクエストバリデーション
const schema = z.object({ jobId: z.string().min(1) })

export const POST = withAuth(async (req, user) => {
  const logger = getLogger().withContext({ route: 'api/consent/expand', method: 'POST' })
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
      logger.warn('Job not in paused state for expansion', { jobId, status: job.status })
    }

    // 元テキスト取得
    const { StorageFactory } = await import('@/utils/storage')
    const novelStorage = await StorageFactory.getNovelStorage()
    const novelId = job.novelId
    const key = `${novelId}.json`
    const stored = await novelStorage.get(key)
    if (!stored) {
      return createErrorResponse(new ApiError('元テキストが見つかりません', 404, 'NOT_FOUND'))
    }
    let originalText: string
    try {
      const obj = JSON.parse(stored.text)
      originalText = typeof obj.text === 'string' ? obj.text : ''
    } catch {
      originalText = stored.text
    }

    const config = getAppConfigWithOverrides()
    if (!config.expansion.enabled) {
  return createErrorResponse(new ApiError('拡張機能は無効です', 400, 'INVALID_INPUT'))
    }

  // 分岐マーカー保存（拡張ブランチ）
  await saveBranchMarker(jobId, BranchType.EXPAND)

  // LLM で拡張
    const generator = getLlmStructuredGenerator() // 既存インフラ再利用（構造化でなく text 用に直接 generateObjectWithFallback は使わず chunk-conversion 方式を避ける）
    // 簡易: structured-generator は JSONスキーマ必須なので、ここでは低リスクの暫定実装として chunk-conversion の runChunkConversion を避け、provider SDK ラッパが無いため
    // plain text を得るために一時的に最小スキーマを使って返却する。
    const { z } = await import('zod')
    const TextSchema = z.object({ text: z.string() })
    const sys = buildAIExpansionSystem(config.expansion.targetScenarioChars)
    const userPrompt = buildAIExpansionUser(originalText)
    const wrapped = await generator.generateObjectWithFallback<{ text: string }>({
      name: 'ai-expansion',
      systemPrompt: sys,
      userPrompt: `${userPrompt}\n\n出力はJSON一行のみ {"text":"..."}`,
      schema: TextSchema,
      schemaName: 'ExpandedScenario',
    })

    const expanded = wrapped.text.trim()
    if (expanded.length < 100) {
      return createErrorResponse(
        new ApiError('拡張結果が短すぎます', 500, 'INTERNAL_ERROR'),
      )
    }

    // 上書き保存
    const newPayload = JSON.stringify({ text: expanded, expandedFrom: originalText.slice(0, 200) })
    await novelStorage.put(key, newPayload, { jobId, novelId })

    // ジョブを再開状態に
  db.jobs().updateJobStatus(jobId, 'processing', 'expansion applied')
    db.jobs().updateJobStep(jobId, 'initialized')

  // 非同期でパイプライン再実行
  // TODO(job-queue): 現在 fire-and-forget。サーバープロセス終了でロストする恐れがあるため
  // BullMQ / RabbitMQ / Cloud Tasks 等の永続キューに移行し、再試行・可観測性を付与する。
  logger.warn('Expansion pipeline scheduled via fire-and-forget (non-durable). Queue migration pending.', { jobId })
    ;(async () => {
      try {
        const { AnalyzePipeline } = await import('@/services/application/analyze-pipeline')
        const pipeline = new AnalyzePipeline()
        await pipeline.runWithText(novelId, expanded, { existingJobId: jobId })
      } catch (e) {
        logger.error('Expansion pipeline run failed', { jobId, error: e instanceof Error ? e.message : String(e) })
        try {
          db.jobs().updateJobStatus(
            jobId,
            'failed',
            e instanceof Error ? e.message : String(e),
          )
        } catch (updateErr) {
          logger.warn('Failed to update job status after expansion pipeline error', {
            jobId,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          })
        }
      }
    })()

    return createSuccessResponse({ jobId, resumed: true, branch: 'EXPANDED' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return createErrorResponse(new ApiError(message, 500, 'INTERNAL_ERROR'))
  }
})
