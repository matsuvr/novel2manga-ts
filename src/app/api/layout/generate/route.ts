import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { JobProgressService } from '@/services/application/job-progress'
import { generateEpisodeLayout } from '@/services/application/layout-generation'
import { renderBatchFromYaml } from '@/services/application/render'
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
      dialogueDensity: z.number().min(0).max(1).optional(),
      visualComplexity: z.number().min(0).max(1).optional(),
      highlightPanelSizeMultiplier: z.number().min(1).max(3).optional(),
      readingDirection: z.literal('right-to-left').optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
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

    // ここまででepisodeは存在。サービスでレイアウト生成
    const { layout, storageKey } = await generateEpisodeLayout(jobId, episodeNumber, {
      isDemo,
      config,
    })

    // 自動レンダリングはデモ時スキップ（DB未整備のため）
    try {
      if (!isDemo) {
        const ports = getStoragePorts()
        const yamlContent = (await ports.layout.getEpisodeLayout(jobId, episodeNumber)) || ''
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
}
