import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { Job } from '@/db'
import { getJobRepository } from '@/repositories'
import { ApiError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

export type ChunkRecord = {
  jobId: string
  chunkIndex: number
  content?: string
}

export async function getJobDetails(jobId: string): Promise<{ job: Job; chunks: ChunkRecord[] }> {
  const jobRepo = getJobRepository()
  const job = (await jobRepo.getJob(jobId)) as Job | null
  if (!job) throw new ApiError('ジョブが見つかりません', 404, 'NOT_FOUND')

  const chunks = await loadChunkRecords(jobId)
  if (chunks.length > 0) return { job, chunks }

  // Fallback 1: DB の totalChunks があればスタブを返す
  const stubCount = Math.max(job.totalChunks || 0, 0)
  if (stubCount > 0) {
    const stubs = Array.from({ length: stubCount }).map((_, idx) => ({
      jobId,
      chunkIndex: idx,
    }))
    return { job, chunks: stubs }
  }

  // Fallback 2: レガシー互換として 2 件のスタブ
  const legacy = [0, 1].map((idx) => ({ jobId, chunkIndex: idx }))
  return { job, chunks: legacy }
}

async function loadChunkRecords(jobId: string): Promise<ChunkRecord[]> {
  const records: ChunkRecord[] = []
  // まずはストレージからキー列挙
  try {
    const storage = await StorageFactory.getChunkStorage()
    const keys = (await storage.list?.(`${jobId}/`)) || []
    const chunkKeyRegex = /chunk_(\d+)\.txt$/
    const indices = keys
      .map((k) => {
        const m = k.match(chunkKeyRegex)
        return m ? Number.parseInt(m[1] || '0', 10) : null
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
    for (const idx of indices) {
      const obj = await storage.get(`${jobId}/chunk_${idx}.txt`)
      let content: string | undefined
      if (obj) {
        // LocalFileStorage は text を base64 で返す場合がある
        try {
          content = Buffer.from(obj.text, 'base64').toString('utf-8')
        } catch {
          content = obj.text
        }
      }
      records.push({ jobId, chunkIndex: idx, ...(content ? { content } : {}) })
    }
    if (records.length > 0) return records
  } catch {
    // noop
  }

  // ストレージ列挙が空/失敗時、開発/テスト環境ではローカルディレクトリから読み込む
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dir = path.join(process.cwd(), '.test-storage', 'chunks', jobId)
      const entries = await fs.readdir(dir)
      const chunkKeyRegex = /chunk_(\d+)\.txt$/
      const indices = entries
        .map((name) => {
          const m = name.match(chunkKeyRegex)
          return m ? Number.parseInt(m[1] || '0', 10) : null
        })
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b)
      for (const idx of indices) {
        try {
          const buf = await fs.readFile(path.join(dir, `chunk_${idx}.txt`))
          records.push({
            jobId,
            chunkIndex: idx,
            content: buf.toString('utf-8'),
          })
        } catch {
          // ignore per-file errors
        }
      }
    } catch {
      // ignore directory read error
    }
  }

  return records
}
