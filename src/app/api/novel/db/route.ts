import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getDatabaseService } from '@/services/db-factory'
import { NovelRepository } from '@/repositories/novel-repository'
import { JobRepository } from '@/repositories/job-repository'

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
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 })
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
  await jobRepo.createWithId(jobId, uuid as string, 'text_analysis')

    return NextResponse.json({
      success: true,
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
    return NextResponse.json({ error: 'Novelの保存中にエラーが発生しました' }, { status: 500 })
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
        return NextResponse.json({ error: 'Novelが見つかりません' }, { status: 404 })
      }

      // 関連するジョブを取得
  const jobRepo = new JobRepository(dbService)
  const jobsList = await jobRepo.getByNovelId(id)

      return NextResponse.json({ novel, jobs: jobsList })
    } else {
      // 全てのNovelを取得
      const novelsList = await novelRepo.list()

      return NextResponse.json({ novels: novelsList })
    }
  } catch (error) {
    console.error('Novel取得エラー:', error)
    return NextResponse.json({ error: 'Novelの取得中にエラーが発生しました' }, { status: 500 })
  }
}
