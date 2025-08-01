import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

interface ShareRequest {
  jobId: string
  episodeNumbers?: number[]
  expiresIn?: number // 時間単位（デフォルト72時間）
}

export async function POST(request: NextRequest) {
  try {
    // TODO: 認証チェック
    // const session = await getSession(request)
    // if (!session) {
    //   return authError()
    // }

    const body = (await request.json()) as Partial<ShareRequest>

    // バリデーション
    if (!body.jobId) {
      return validationError('jobIdが必要です')
    }

    const expiresIn = body.expiresIn || 72 // デフォルト72時間
    if (expiresIn < 1 || expiresIn > 168) {
      // 最大1週間
      return validationError('expiresInは1から168（時間）の間で指定してください')
    }

    const db = await StorageFactory.getDatabase()

    try {
      // ジョブの存在確認
      const job = await db.get('SELECT * FROM jobs WHERE id = ?', [body.jobId])

      if (!job) {
        return validationError('指定されたジョブが見つかりません')
      }

      // TODO: 共有リンクの実装
      // 1. 共有トークンを生成
      // 2. 有効期限を設定
      // 3. データベースに保存
      // 4. 共有URLを生成

      const shareToken = randomUUID()
      const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000)

      // TODO: 共有情報をDBに保存
      // await db.run(
      //   `INSERT INTO shares (token, job_id, episode_numbers, expires_at, created_at)
      //    VALUES (?, ?, ?, ?, ?)`,
      //   [shareToken, body.jobId, JSON.stringify(body.episodeNumbers || []), expiresAt.toISOString(), new Date().toISOString()]
      // )

      const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${shareToken}`

      return successResponse(
        {
          success: true,
          shareUrl,
          token: shareToken,
          expiresAt: expiresAt.toISOString(),
          message: '共有機能は未実装です',
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
