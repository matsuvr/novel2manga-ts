import fs from 'node:fs/promises'
import path from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { createErrorResponse, NotFoundError, ValidationError } from '@/utils/api-error'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    if (!id) {
      throw new ValidationError('ジョブIDが指定されていません')
    }

    // 本番（想定）: DB から取得
    if (process.env.NODE_ENV === 'production') {
      const db = new DatabaseService()
      let job: any = null
      const getJob = (db as any).getJob as ((jobId: string) => Promise<unknown>) | undefined
      if (typeof getJob === 'function') {
        job = await getJob(id)
      }

      if (!job) throw new NotFoundError('ジョブ')

      // チャンクはダミー（本来は DB/Storage から取得）
      const chunks = [
        { jobId: id, chunkIndex: 0 },
        { jobId: id, chunkIndex: 1 },
      ]
      return NextResponse.json({ job, chunks })
    }

    // 開発/テスト: ローカルファイルから取得
    const base = path.join(process.cwd(), '.test-storage', 'jobs')
    const jobPath = path.join(base, `${id}.json`)
    try {
      const jobText = await fs.readFile(jobPath, 'utf-8')
      const job = JSON.parse(jobText)

      // チャンクディレクトリ
      const chunksDir = path.join(process.cwd(), '.test-storage', 'chunks', id)
      let chunks: Array<{ content: string; jobId?: string }> = []
      try {
        const files = await fs.readdir(chunksDir)
        const sorted = files.filter((f) => f.startsWith('chunk_')).sort()
        for (const f of sorted) {
          const content = await fs.readFile(path.join(chunksDir, f), 'utf-8')
          chunks.push({ content })
        }
      } catch {
        chunks = []
      }

      return NextResponse.json({ job, chunks })
    } catch {
      throw new NotFoundError('ジョブ')
    }
  } catch (error) {
    return createErrorResponse(error, 'Failed to get job details')
  }
}
