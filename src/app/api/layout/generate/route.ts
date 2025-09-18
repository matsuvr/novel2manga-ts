import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { JobProgressService } from '@/services/application/job-progress'
import { generateEpisodeLayout } from '@/services/application/layout-generation'
import { renderBatchFromYaml } from '@/services/application/render'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { detectDemoMode } from '@/utils/request-mode'

const requestSchema = z.object({
  jobId: z.string(),
  episodeNumber: z.number().int().positive(),
  config: z
    .object({
      panelsPerPage: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
          average: z.number().optional(),
        })
        .optional(),
      dialogueDensity: z.number().optional(),
      visualComplexity: z.number().optional(),
      highlightPanelSizeMultiplier: z.number().optional(),
      readingDirection: z.literal('right-to-left').optional(),
    })
    .optional(),
})

export const POST = withAuth(async (request: NextRequest, user) => {
  let jobIdForError: string | undefined
  try {
    const _logger = getLogger().withContext({
      route: 'api/layout/generate',
      method: 'POST',
    })
    const body = await request.json()
    const validatedData = requestSchema.parse(body)
    const { jobId, episodeNumber, config } = validatedData
    jobIdForError = jobId
    const isDemo = detectDemoMode(request, body)

    // ユーザー所有権チェック
    const job = await db.jobs().getJob(jobId)
    if (!job) {
      // 404 は ApiError サブクラスで表現
      return createErrorResponse(
        new Error('指定されたジョブが見つかりません'),
        '指定されたジョブが見つかりません',
      )
    }
    if (job.userId && job.userId !== user.id) {
      // 403 も createErrorResponse 第3引数ではなく既存パラメータで処理（ステータスはデフォルト 500 想定のため ForbiddenError 移行 TODO）
      return createErrorResponse(new Error('アクセス権限がありません'), 'アクセス権限がありません')
    }

    // ここまででepisodeは存在。サービスでレイアウト生成
    const { layout, storageKey } = await generateEpisodeLayout(jobId, episodeNumber, {
      isDemo,
      config,
    })

    // 自動レンダリングはデモ時スキップ（DB未整備のため）
    try {
      if (!isDemo) {
        const ports = getStoragePorts()
        const yamlContent =
          (await ports.layout.getEpisodeLayout(job.novelId, jobId, episodeNumber)) || ''
        await renderBatchFromYaml(jobId, episodeNumber, yamlContent, undefined, undefined, ports)
      }
    } catch (e) {
      const _logger = getLogger().withContext({
        route: 'api/layout/generate',
        method: 'POST',
      })
      _logger.warn('Render kick failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }

    return createSuccessResponse({
      message: 'Layout generated successfully',
      jobId,
      episodeNumber,
      storageKey,
      // Backward compatibility alias (TODO: remove after 2025-09-01)
      layoutPath: storageKey,
      layout,
    })
  } catch (error) {
    const _logger = getLogger().withContext({
      route: 'api/layout/generate',
      method: 'POST',
    })
    _logger.error('Error generating layout', {
      error: error instanceof Error ? error.message : String(error),
    })
    // 失敗時はジョブに明確なエラー理由とステップを記録
    try {
      if (jobIdForError) {
        const jobService = new JobProgressService()
        await jobService.updateError(
          jobIdForError,
          `Layout generation failed: ${error instanceof Error ? error.message : String(error)}`,
          'layout',
          true,
        )
      }
    } catch {
      // noop
    }
    return createErrorResponse(error, 'Failed to generate layout')
  }
})
