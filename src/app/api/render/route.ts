import type { NextRequest } from 'next/server'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'

interface RenderRequest {
  jobId: string
  episodeNumber: number
  pageNumber: number
  layoutYaml: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<RenderRequest>

    // バリデーション
    if (!body.jobId) {
      return validationError('jobIdが必要です')
    }

    if (typeof body.episodeNumber !== 'number' || body.episodeNumber < 1) {
      return validationError('有効なepisodeNumberが必要です')
    }

    if (typeof body.pageNumber !== 'number' || body.pageNumber < 1) {
      return validationError('有効なpageNumberが必要です')
    }

    if (!body.layoutYaml || typeof body.layoutYaml !== 'string') {
      return validationError('layoutYamlが必要です')
    }

    // TODO: Canvas APIによるレンダリング実装
    // 1. YAMLをパース
    // 2. Canvas要素を作成
    // 3. パネルの枠線を描画
    // 4. 吹き出しを配置
    // 5. テキストを描画
    // 6. 画像をPNGとして保存

    // 仮の実装
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderKey = StorageKeys.pageRender(body.jobId, body.episodeNumber, body.pageNumber)

    // TODO: 実際のCanvas描画結果を保存
    const mockImageData = Buffer.from('mock-image-data')
    await renderStorage.put(renderKey, mockImageData, {
      contentType: 'image/png',
      jobId: body.jobId,
      episodeNumber: body.episodeNumber.toString(),
      pageNumber: body.pageNumber.toString(),
    })

    return successResponse(
      {
        success: true,
        renderKey,
        message: 'レンダリング機能は未実装です',
        jobId: body.jobId,
        episodeNumber: body.episodeNumber,
        pageNumber: body.pageNumber,
      },
      201,
    )
  } catch (error) {
    return handleApiError(error)
  }
}
