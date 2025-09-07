import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database/index'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

interface ShareRequest {
  jobId: string
  episodeNumbers?: number[]
  expiresIn?: number // 有効期限（時間）デフォルト72時間
}

interface ShareResponse {
  success: boolean
  shareUrl: string
  token: string
  expiresAt: string
  message: string
  episodeNumbers?: number[]
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<ShareRequest>

    // バリデーション
    if (!body.jobId) return validationError('jobIdが必要です')
    validateJobId(body.jobId)

    const expiresIn = body.expiresIn !== undefined ? body.expiresIn : 72 // デフォルト72時間

    // 有効期限の範囲チェック（1時間〜1週間）
    if (expiresIn < 1 || expiresIn > 168) {
      return validationError('expiresInは1から168（時間）の間で指定してください')
    }

    // データベースサービスの初期化
    // ジョブの存在確認
    const job = await db.jobs().getJob(body.jobId)
    if (!job) {
      return validationError('指定されたジョブが見つかりません')
    }

    // エピソード指定がある場合は存在確認
    if (body.episodeNumbers && body.episodeNumbers.length > 0) {
      const episodes = await db.episodes().getEpisodesByJobId(body.jobId)
      const existingEpisodeNumbers = new Set(episodes.map((e) => e.episodeNumber))

      const nonExistentEpisodes = body.episodeNumbers.filter(
        (num) => !existingEpisodeNumbers.has(num),
      )

      if (nonExistentEpisodes.length > 0) {
        return validationError(
          `指定されたエピソードが見つかりません: ${nonExistentEpisodes.join(', ')}`,
        )
      }
    }

    // 共有トークンの生成
    const shareToken = crypto.randomUUID()

    // 有効期限の計算
    const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000)

    getLogger().withContext({ route: 'api/share', method: 'POST' }).info('共有リンク生成', {
      jobId: body.jobId,
      token: shareToken,
      expiresAt: expiresAt.toISOString(),
    })

    // 共有情報をデータベースに保存
    // TODO: 共有テーブル（shares）を作成して共有情報を保存
    // await dbService.createShare({
    //   token: shareToken,
    //   jobId: body.jobId,
    //   episodeNumbers: body.episodeNumbers,
    //   expiresAt: expiresAt.toISOString(),
    // })

    // 共有URLの生成
    const baseUrl = request.headers.get('host')
      ? `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`
      : 'http://localhost:3000'

    const shareUrl = `${baseUrl}/share/${shareToken}`

    getLogger().withContext({ route: 'api/share', method: 'POST' }).info('共有リンク作成完了', {
      url: shareUrl,
    })

    return successResponse(
      {
        success: true,
        shareUrl,
        token: shareToken,
        expiresAt: expiresAt.toISOString(),
        message: '共有機能は未実装です',
        episodeNumbers: body.episodeNumbers,
      } as ShareResponse,
      201,
    )
  } catch (error) {
    getLogger()
      .withContext({ route: 'api/share', method: 'POST' })
      .error('Share API error', {
        error: error instanceof Error ? error.message : String(error),
      })
    return handleApiError(error)
  }
}
