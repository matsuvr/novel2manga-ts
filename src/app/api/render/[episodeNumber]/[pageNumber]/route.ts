import type { NextRequest } from 'next/server'
import { createErrorResponse, handleApiError, validationError } from '@/utils/api-error'

interface RouteParams {
  episodeNumber: string
  pageNumber: string
}

/**
 * GET /api/render/[episodeNumber]/[pageNumber]
 * 指定されたエピソードとページ番号でレンダリング済みの画像を取得
 */
export async function GET(_request: NextRequest, { params }: { params: RouteParams }) {
  try {
    // URL パラメータを数値に変換
    const episodeNum = parseInt(params.episodeNumber, 10)
    const pageNum = parseInt(params.pageNumber, 10)

    // パラメータのバリデーション
    if (!params.episodeNumber || !params.pageNumber) {
      return validationError('エピソード番号とページ番号が必要です')
    }

    // 数値変換の検証
    if (Number.isNaN(episodeNum) || Number.isNaN(pageNum)) {
      return validationError('有効なエピソード番号とページ番号が必要です')
    }

    if (episodeNum < 1 || pageNum < 1) {
      return validationError('エピソード番号とページ番号は1以上である必要があります')
    }

    // TODO: 実際の実装では、jobIdを特定する方法が必要
    // 現在は開発中のため、501ステータスを返す
    return createErrorResponse(
      new Error('このエンドポイントは開発中です'),
      'jobIdを特定する仕組みが必要です',
    )
  } catch (error) {
    console.error('Render GET API error:', error)
    return handleApiError(error)
  }
}
