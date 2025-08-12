import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import { JobRepository } from '@/repositories/job-repository'
import { NovelRepository } from '@/repositories/novel-repository'
import { getDatabaseService } from '@/services/db-factory'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'

// Novel要素を保存
export async function POST(request: NextRequest) {
  try {
    const { uuid, fileName, length, totalChunks, chunkSize, overlapSize } =
      (await request.json()) as {
        uuid: unknown
        fileName: unknown
        length: unknown
        totalChunks: unknown
        chunkSize: unknown
        overlapSize: unknown
      }

    // バリデーション
    if (
      !uuid ||
      !fileName ||
      typeof length !== 'number' ||
      typeof totalChunks !== 'number' ||
      typeof chunkSize !== 'number' ||
      typeof overlapSize !== 'number'
    ) {
      return createErrorResponse(
        new Error('必須パラメータが不足しています'),
        '必須パラメータが不足しています',
      )
    }

    const dbService = getDatabaseService()
    const novelRepo = new NovelRepository(dbService)

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
    const jobId = crypto.randomUUID()
    const jobRepo = new JobRepository(dbService)
    await jobRepo.create({ id: jobId, novelId: uuid as string, title: 'text_analysis' })

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
    console.error('Novel保存エラー:', error)
    return createErrorResponse(error, 'Novelの保存中にエラーが発生しました')
  }
}

// Novel一覧を取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const dbService = getDatabaseService()
    const novelRepo = new NovelRepository(dbService)

    if (id) {
      // 特定のNovelを取得
      const novel = await novelRepo.get(id)

      if (!novel) {
        return createErrorResponse(new Error('Novelが見つかりません'), 'Novelが見つかりません')
      }

      // 関連するジョブを取得
      const jobRepo = new JobRepository(dbService)
      const jobsList = await jobRepo.getByNovelId(id)

      return createSuccessResponse({ novel, jobs: jobsList })
    } else {
      // 全てのNovelを取得
      const novelsList = await novelRepo.list()

      return createSuccessResponse({ novels: novelsList })
    }
  } catch (error) {
    console.error('Novel取得エラー:', error)
    return createErrorResponse(error, 'Novelの取得中にエラーが発生しました')
  }
}
