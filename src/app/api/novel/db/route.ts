import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { adaptAll } from '@/repositories/adapters'
import { JobRepository } from '@/repositories/job-repository'
import { NovelRepository } from '@/repositories/novel-repository'
import { getDatabaseService } from '@/services/db-factory'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { generateUUID } from '@/utils/uuid'

// Novel要素を保存
export async function POST(request: NextRequest) {
  try {
    // スキーマ定義（エラー整形のため issues を収集）
    const schema = z.object({
      uuid: z.string().min(1, 'uuid は必須です'),
      fileName: z.string().min(1, 'fileName は必須です'),
      length: z.number().int().nonnegative(),
      totalChunks: z.number().int().positive(),
      chunkSize: z.number().int().positive(),
      overlapSize: z.number().int().min(0),
    })

    let json: unknown
    try {
      json = await request.json()
    } catch {
      return createErrorResponse(
        new ApiError('無効なJSONが送信されました', 400, 'INVALID_INPUT'),
        '無効なJSONが送信されました',
      )
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      return createErrorResponse(
        new ApiError('リクエストボディが無効です', 400, 'INVALID_INPUT', {
          issues: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        }),
        'リクエストボディが無効です',
      )
    }

    const { uuid, fileName, length, totalChunks, chunkSize, overlapSize } = parsed.data

    const dbService = getDatabaseService()
    const { novel: novelPort, job: jobPort } = adaptAll(dbService)
    const novelRepo = new NovelRepository(novelPort)

    // 小説データを保存
    await novelRepo.ensure(uuid as string, {
      title: fileName as string,
      author: '',
      originalTextPath: fileName as string,
      textLength: length,
      language: 'ja',
      metadataPath: null,
    })

    // 処理ジョブを作成
    const jobId = generateUUID()
    const jobRepo = new JobRepository(jobPort)
    await jobRepo.create({
      id: jobId,
      novelId: uuid as string,
      title: 'text_analysis',
    })

    return createSuccessResponse({
      novel: {
        id: uuid,
        originalTextFile: fileName,
        totalLength: length,
        totalChunks: totalChunks,
        chunkSize: chunkSize,
        overlapSize: overlapSize,
      },
      job: {
        id: jobId,
        type: 'text_analysis',
        status: 'pending',
      },
    })
  } catch (error) {
    console.error('Novel保存エラー:', {
      error,
      // uuid がパースに失敗した場合 undefined の可能性があるため optional
      uuid:
        error instanceof Error && 'uuid' in error
          ? (error as Error & { uuid?: string }).uuid
          : undefined,
      requestId: randomUUID(), // Add request tracing
      timestamp: new Date().toISOString(),
    })
    return createErrorResponse(error, 'Novelの保存中にエラーが発生しました')
  }
}

// Novel一覧を取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const dbService = getDatabaseService()
    const { novel: novelPort, job: jobPort } = adaptAll(dbService)
    const novelRepo = new NovelRepository(novelPort)

    if (id) {
      // 特定のNovelを取得
      const novel = await novelRepo.get(id)

      if (!novel) {
        return createErrorResponse(new Error('Novelが見つかりません'), 'Novelが見つかりません')
      }

      // 関連するジョブを取得
      const jobRepo = new JobRepository(jobPort)
      const jobsList = await jobRepo.getByNovelId(id)

      return createSuccessResponse({ novel, jobs: jobsList })
    } else {
      // 全てのNovelを取得
      const novelsList = await novelRepo.list()
      return createSuccessResponse({ novels: novelsList })
    }
  } catch (error) {
    console.error('Novel取得エラー:', {
      error,
      requestId: randomUUID(), // Add request tracing
      timestamp: new Date().toISOString(),
    })
    return createErrorResponse(error, 'Novelの取得中にエラーが発生しました')
  }
}
