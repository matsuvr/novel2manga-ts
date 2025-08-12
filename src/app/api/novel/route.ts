import type { NextRequest } from 'next/server'
import { adaptAll } from '@/repositories/adapters'
import { NovelRepository } from '@/repositories/novel-repository'
import { getDatabaseService } from '@/services/db-factory'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { saveNovelToStorage } from './storage/route'

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: unknown }

    if (!text || typeof text !== 'string') {
      return createErrorResponse(new Error('テキストが必要です'))
    }

    const data = await saveNovelToStorage(text)

    // Repositoryを使用してDBに保存
    try {
      const dbService = getDatabaseService()
      const { novel: novelPort } = adaptAll(dbService)
      const novelRepo = new NovelRepository(novelPort)

      // 小説情報をDBに保存（UUIDを指定）
      await novelRepo.ensure(data.uuid, {
        title: `Novel ${data.uuid.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: data.fileName,
        textLength: data.length,
        language: 'ja',
        metadataPath: null,
      })

      console.log(`✓ 小説をDBに保存: ${data.uuid}`)
    } catch (dbError) {
      console.error('DB保存エラー:', dbError)
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }

    return createSuccessResponse({
      preview: data.preview || text.slice(0, 100),
      originalLength: text.length,
      fileName: data.fileName,
      uuid: data.uuid,
      message: '小説テキストを受信しました',
    })
  } catch (error) {
    console.error('小説アップロードAPIエラー:', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      timestamp: new Date().toISOString(),
    })

    return createErrorResponse(error, 'サーバーエラーが発生しました')
  }
}
