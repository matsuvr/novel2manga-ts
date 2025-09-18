import type { NextRequest } from 'next/server'
import { appConfig } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { renderBatchFromYaml } from '@/services/application/render'
// Use unified barrel so tests that mock '@/services/database' apply here too
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
  ValidationError,
} from '@/utils/api-error'
import { detectDemoMode } from '@/utils/request-mode'
import { StorageFactory, StorageKeys } from '@/utils/storage'
import { validateJobId } from '@/utils/validators'

interface RenderRequest {
  jobId: string
  episodeNumber: number
  pageNumber: number
  layoutYaml: string
}

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const _logger = getLogger().withContext({
      route: 'api/render',
      method: 'POST',
    })
    const body = (await request.json()) as Partial<RenderRequest>

    // Demoモード: 依存（DB, layout YAML）をスキップし、プレースホルダーPNGを生成
    const isDemo = detectDemoMode(request, body)
    if (isDemo) {
      if (!body.jobId)
        return createErrorResponse(new ValidationError('jobIdが必要です（demoモード）'))
      validateJobId(body.jobId)
      if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1)
        return createErrorResponse(
          new ValidationError('有効なepisodeNumberが必要です（demoモード）'),
        )
      if (typeof body.pageNumber !== 'number' || body.pageNumber < 1)
        return createErrorResponse(new ValidationError('有効なpageNumberが必要です（demoモード）'))

      // 1x1 PNG（透明）のベース64（最小）
      const base64Png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
      const buffer = Buffer.from(base64Png, 'base64')

      const demoNovelId = `demo-${body.jobId}`
      const renderKey = StorageKeys.pageRender({
        novelId: demoNovelId,
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
      })
      const thumbnailKey = StorageKeys.pageThumbnail({
        novelId: demoNovelId,
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
      })
      const storage = await StorageFactory.getRenderStorage()
      await storage.put(renderKey, buffer, {
        'content-type': 'image/png',
      })
      await storage.put(thumbnailKey, buffer, {
        'content-type': 'image/png',
      })

      return createSuccessResponse(
        {
          success: true,
          renderKey,
          thumbnailKey,
          message: 'デモ画像を生成しました',
          jobId: body.jobId,
          episodeNumber: body.episodeNumber,
          pageNumber: body.pageNumber,
          fileSize: buffer.byteLength,
          dimensions: {
            width: 1,
            height: 1,
          },
          renderedAt: new Date().toISOString(),
        },
        201,
      )
    }

    // 入力バリデーション
    if (!body.jobId) return createErrorResponse(new ValidationError('jobIdが必要です'))
    validateJobId(body.jobId)
    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1)
      return createErrorResponse(new ValidationError('有効なepisodeNumberが必要です'))
    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1)
      return createErrorResponse(new ValidationError('有効なpageNumberが必要です'))
    // layoutYaml が未指定ならストレージポートから取得
    let layoutYaml = body.layoutYaml
    // DBチェック（NovelIdを含む完全なジョブ情報を取得）
    const job = await db.jobs().getJob(body.jobId)
    // Treat unknown jobId as a client validation issue in this endpoint (legacy tests expect 400)
    if (!job) return createErrorResponse(new ValidationError('指定されたジョブが見つかりません'))
    const novelId = job.novelId

    if (!layoutYaml) {
      const ports = getStoragePorts()
      const text = await ports.layout.getEpisodeLayout(novelId, body.jobId, body.episodeNumber)
      if (!text) return createErrorResponse(new ValidationError('layoutYamlが必要です'))
      layoutYaml = text
    }

    // ユーザー所有権チェック
    if (job.userId && job.userId !== user.id) {
      return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
    }

    const episodes = await db.episodes().getEpisodesByJobId(body.jobId)
    const targetEpisode = episodes.find((e) => e.episodeNumber === body.episodeNumber)
    if (!targetEpisode)
      return createErrorResponse(
        new ValidationError(`エピソード ${body.episodeNumber} が見つかりません`),
      )

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
      return createErrorResponse(new Error(first?.error || 'レンダリングに失敗しました'))
    }
    return createSuccessResponse(
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
          height: appConfig.rendering.defaultPageSize.height,
        },
        renderedAt: first.renderedAt,
      },
      201,
    )
  } catch (error) {
    return createErrorResponse(error)
  }
})
