import fs from 'node:fs/promises'
import path from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { toErrorResponse } from '@/utils/api-error-response'
import { HttpError } from '@/utils/http-errors'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    if (!id) {
      throw new HttpError('ジョブIDが指定されていません', 400)
    }

    // 本番（想定）: DB から取得
    if (process.env.NODE_ENV === 'production') {
      const db = new DatabaseService()
      let job: any = null
      try {
        job = await (db as any).getJob?.(id)
      } catch (_e) {
        throw new HttpError('ジョブが見つかりません', 404)
      }
      if (!job) throw new HttpError('ジョブが見つかりません', 404)
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
      throw new HttpError('ジョブが見つかりません', 404)
    }
  } catch (error) {
    return toErrorResponse(error, 'Failed to get job details')
  }
}
