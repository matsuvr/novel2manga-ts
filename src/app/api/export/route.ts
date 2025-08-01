import type { NextRequest } from 'next/server'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

interface ExportRequest {
  jobId: string
  format: 'pdf' | 'cbz' | 'images_zip' | 'epub'
  episodeNumbers?: number[]
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ExportRequest>

    // バリデーション
    if (!body.jobId) {
      return validationError('jobIdが必要です')
    }

    if (!body.format || !['pdf', 'cbz', 'images_zip', 'epub'].includes(body.format)) {
      return validationError('有効なformatが必要です（pdf, cbz, images_zip, epub）')
    }

    // TODO: エクスポート機能の実装
    // 1. ジョブのレンダリング済み画像を取得
    // 2. 指定フォーマットに変換
    // 3. ファイルを生成して保存
    // 4. ダウンロードURLを返す

    const db = await StorageFactory.getDatabase()

    try {
      // ジョブの存在確認
      const job = await db.get('SELECT * FROM jobs WHERE id = ?', [body.jobId])

      if (!job) {
        return validationError('指定されたジョブが見つかりません')
      }

      // TODO: 実際のエクスポート処理

      return successResponse(
        {
          success: true,
          message: 'エクスポート機能は未実装です',
          jobId: body.jobId,
          format: body.format,
          downloadUrl: null,
        },
        201,
      )
    } finally {
      await db.close()
    }
  } catch (error) {
    return handleApiError(error)
  }
}
