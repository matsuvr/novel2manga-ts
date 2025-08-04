import fs from 'node:fs/promises'
import path from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import type { Chunk, Job, JobResponse } from '@/types/job'
import { getD1Database } from '@/utils/cloudflare-env'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const jobId = params.id

    if (!jobId) {
      return NextResponse.json({ error: 'ジョブIDが指定されていません' }, { status: 400 })
    }

    const isProduction = process.env.NODE_ENV === 'production'

    if (isProduction) {
      const dbService = new DatabaseService()

      const job = await dbService.getJob(jobId)
      if (!job) {
        return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 })
      }

      const chunks = await dbService.getChunksByJobId(jobId)

      const response: JobResponse = {
        job,
        chunks,
      }

      return NextResponse.json(response)
    } else {
      // 開発環境: ローカルファイルシステムから読み込み
      const baseDir = path.join(process.cwd(), '.local-storage')

      // ジョブ情報を読み込み
      const jobPath = path.join(baseDir, 'jobs', `${jobId}.json`)
      try {
        const jobData = await fs.readFile(jobPath, 'utf-8')
        const job: Job = JSON.parse(jobData)

        // チャンクを読み込み
        const chunksDir = path.join(baseDir, 'chunks', jobId)
        const chunkFiles = await fs.readdir(chunksDir)
        const chunks: Chunk[] = await Promise.all(
          chunkFiles
            .filter((f) => f.startsWith('chunk_'))
            .sort((a, b) => {
              const aIndex = parseInt(a.match(/chunk_(\d+)\.txt/)?.[1] || '0')
              const bIndex = parseInt(b.match(/chunk_(\d+)\.txt/)?.[1] || '0')
              return aIndex - bIndex
            })
            .map(async (file, index) => {
              const content = await fs.readFile(path.join(chunksDir, file), 'utf-8')
              return {
                id: `${jobId}-chunk-${index}`,
                jobId,
                chunkIndex: index,
                content,
                fileName: file,
                createdAt: new Date().toISOString(),
              }
            }),
        )

        const response: JobResponse = {
          job,
          chunks,
        }

        return NextResponse.json(response)
      } catch (_error) {
        return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 })
      }
    }
  } catch (error) {
    console.error('ジョブ取得エラー:', error)
    return NextResponse.json({ error: 'ジョブの取得中にエラーが発生しました' }, { status: 500 })
  }
}
