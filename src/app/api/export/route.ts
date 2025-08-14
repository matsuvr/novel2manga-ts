import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { OutputService } from '@/services/application/output-service'
import { ApiResponder } from '@/utils/api-responder'
import { validateJobId } from '@/utils/validators'

interface ExportRequest {
  jobId: string
  format: 'pdf' | 'images_zip'
  episodeNumbers?: number[]
}

interface ExportResponse {
  success: boolean
  jobId: string
  format: string
  downloadUrl: string | null
  message: string
  fileSize?: number
  pageCount?: number
  exportedAt: string
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    getLogger().withContext({ route: 'api/export', method: 'POST' })
    const body = (await request.json()) as Partial<ExportRequest>

    // バリデーション
    validateJobId(body.jobId)

    const validFormats = ['pdf', 'images_zip']
    if (!body.format || !validFormats.includes(body.format)) {
      return ApiResponder.validation('有効なformatが必要です（pdf, images_zip）')
    }

    const outputService = new OutputService()
    const { outputId, fileSize, pageCount } = await outputService.export(
      body.jobId as string,
      body.format as 'pdf' | 'images_zip',
      body.episodeNumbers,
    )

    return ApiResponder.success(
      {
        success: true,
        jobId: body.jobId as string,
        format: body.format as string,
        downloadUrl: `/api/export/download/${outputId}`,
        message: `${body.format.toUpperCase()}形式でのエクスポートが完了しました`,
        fileSize,
        pageCount,
        exportedAt: new Date().toISOString(),
      } as ExportResponse,
      201,
    )
  } catch (error) {
    return ApiResponder.error(error)
  }
}

// ダウンロード用エンドポイント
export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const _logger = getLogger().withContext({
      route: 'api/export',
      method: 'GET',
    })
    const url = new URL(_request.url)
    // 形式: /api/export/download/[outputId]
    const segments = url.pathname.split('/').filter(Boolean)
    const outputId = segments[segments.length - 1] || ''
    if (!outputId) return ApiResponder.validation('outputIdが必要です')

    // outputId -> outputs 内の実ファイルパスはDBに記録済み（OutputRepository）
    const outputService = new OutputService()
    const record = await outputService.getById(outputId as string)
    if (!record) return ApiResponder.validation('出力が見つかりません')
    const buffer = await outputService.getExportContent(record.outputPath)
    if (!buffer) return ApiResponder.validation('ファイルが存在しません')

    // 形式に応じてContent-Type
    const isPdf = record.outputType === 'pdf'
    const contentType = isPdf ? 'application/pdf' : 'application/zip'

    // LocalFileStorageはBase64ではなくプレーン文字列(JSONなど)を返すケースがあるため、Buffer変換を試行
    // LocalFileStorage.get はバイナリ保存時でも Base64 を返す設計
    // ただし互換のため UTF-8 もフォールバック
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${outputId}.${isPdf ? 'pdf' : 'zip'}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return ApiResponder.error(error)
  }
}
