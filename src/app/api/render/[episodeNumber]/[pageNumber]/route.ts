import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createErrorResponse, handleApiError, validationError } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'
import { validateJobId } from '@/utils/validators'

interface RouteParams {
  episodeNumber: string
  pageNumber: string
}

/**
 * GET /api/render/[episodeNumber]/[pageNumber]
 * 指定されたエピソードとページ番号でレンダリング済みの画像を取得
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: RouteParams | Promise<RouteParams> },
) {
  try {
    const url = new URL(_request.url)
    const jobId = url.searchParams.get('jobId') || ''
    const p = await ctx.params

    if (!jobId) {
      return validationError('jobIdが必要です')
    }
    validateJobId(jobId)

    // URL パラメータを数値に変換
    const episodeNum = parseInt(p.episodeNumber, 10)
    const pageNum = parseInt(p.pageNumber, 10)

    // パラメータのバリデーション
    if (!p.episodeNumber || !p.pageNumber) {
      return validationError('エピソード番号とページ番号が必要です')
    }

    // 数値変換の検証
    if (Number.isNaN(episodeNum) || Number.isNaN(pageNum)) {
      return validationError('有効なエピソード番号とページ番号が必要です')
    }

    if (episodeNum < 1 || pageNum < 1) {
      return validationError('エピソード番号とページ番号は1以上である必要があります')
    }

    // 画像キーを構築してストレージから取得
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderKey = StorageKeys.pageRender(jobId, episodeNum, pageNum)
    const file = await renderStorage.get(renderKey)

    if (!file) {
      return createErrorResponse(new Error(`画像が見つかりません: ${renderKey}`))
    }

    // LocalFileStorageはBase64文字列を返す
    try {
      const buffer = Buffer.from(file.text, 'base64')
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      // もしテキストがそのままバイナリ内容（R2の文字列化など）の場合はUTF-8として扱わず返す
      const buffer = Buffer.from(file.text, 'utf-8')
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }
  } catch (error) {
    console.error('Render GET API error:', error)
    return handleApiError(error)
  }
}
