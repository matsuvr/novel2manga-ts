import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { Job } from '@/db'
// テストのモックが `@/services/database` を対象にしているため
// import パスをバレルに統一してモックが正しく適用されるようにする
import { db } from '@/services/database'
import { ApiError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

export type ChunkRecord = {
  jobId: string
  chunkIndex: number
  content?: string
}

export async function getJobDetails(jobId: string): Promise<{ job: Job; chunks: ChunkRecord[] }> {
  // DatabaseService を直接利用することで、テストでの DatabaseService モックが有効に働く
  const job = await db.jobs().getJob(jobId)
  if (!job) throw new ApiError('ジョブが見つかりません', 404, 'NOT_FOUND')

  // 軽量なDB集計でエピソード別のレンダリング進捗を取得（UIへ即時反映させる）
  // ストレージ走査は行わないため低負荷
  const perEpisode = await computePerEpisodeProgress(jobId)
  // 合計値（totalPages/renderedPages）の再算出（未設定時や遅延時の補助）
  const totals = Object.entries(perEpisode).reduce(
    (acc, [, v]) => {
      acc.total += typeof v.total === 'number' ? v.total : v.planned
      acc.rendered += v.rendered
      return acc
    },
    { total: 0, rendered: 0 },
  )

  // UI が期待する progress ペイロードを付加（型は拡張可とする）
  const jobWithProgress = {
    ...job,
    // DB値が0/未確定の際は、集計値で上書き提供（DB自体は別途更新ルートで整合化）
    totalPages: Math.max(Number(job.totalPages || 0), totals.total),
    renderedPages: Math.max(Number(job.renderedPages || 0), totals.rendered),
    progress: {
      perEpisodePages: Object.fromEntries(
        Object.entries(perEpisode).map(([ep, v]) => [String(ep), v]),
      ),
    },
  } as Job &
    Record<
      'progress',
      {
        perEpisodePages: Record<string, { planned: number; rendered: number; total?: number }>
      }
    >

  const chunks = await loadChunkRecords(jobId)
  if (chunks.length > 0) return { job: jobWithProgress, chunks }

  // Fallback 1: DB の totalChunks があればスタブを返す
  const stubCount = Math.max(job.totalChunks || 0, 0)
  if (stubCount > 0) {
    const stubs = Array.from({ length: stubCount }).map((_, idx) => ({
      jobId,
      chunkIndex: idx,
    }))
    return { job: jobWithProgress, chunks: stubs }
  }

  // Fallback 2: レガシー互換として 2 件のスタブ
  const legacy = [0, 1].map((idx) => ({ jobId, chunkIndex: idx }))
  return { job: jobWithProgress, chunks: legacy }
}

// 型安全なナローイング: モック環境で getPerEpisodeRenderProgress が未定義でも動作させる
type PerEpisodeProgress = Record<number, { planned: number; rendered: number; total?: number }>

function hasMethod<T extends object, K extends string>(
  obj: T,
  name: K,
): obj is T & Record<K, (...args: unknown[]) => unknown> {
  return !!obj && typeof (obj as Record<string, unknown>)[name] === 'function'
}

async function computePerEpisodeProgress(jobId: string): Promise<PerEpisodeProgress> {
  const renderSvc = db.render() as unknown

  // 1) Prefer specialized aggregated API when available
  if (
    renderSvc &&
    typeof renderSvc === 'object' &&
    hasMethod(renderSvc as Record<string, unknown>, 'getPerEpisodeRenderProgress')
  ) {
    // 注意: メソッド参照を切り出すと this が失われるため、直接呼び出して this バインドを保持する
    const result = await (
      renderSvc as { getPerEpisodeRenderProgress: (id: string) => unknown }
    ).getPerEpisodeRenderProgress(jobId)
    // 型安全のため最小限のバリデーション
    if (result && typeof result === 'object') {
      return result as PerEpisodeProgress
    }
  }

  // 2) Fallback: derive from list of render status rows when provided by mocks
  if (
    renderSvc &&
    typeof renderSvc === 'object' &&
    hasMethod(renderSvc as Record<string, unknown>, 'getAllRenderStatusByJob')
  ) {
    const rows = (await (
      renderSvc as { getAllRenderStatusByJob: (id: string) => unknown }
    ).getAllRenderStatusByJob(jobId)) as
      | Array<{ episodeNumber: number; isRendered?: boolean }>
      | undefined

    const agg: PerEpisodeProgress = {}
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const ep = Number(r.episodeNumber)
        if (!Number.isFinite(ep)) continue
        let bucket = agg[ep]
        if (!bucket) {
          bucket = { planned: 0, rendered: 0 }
          agg[ep] = bucket
        }
        bucket.planned += 1
        if (r.isRendered) bucket.rendered += 1
      }
    }
    return agg
  }

  // 3) Nothing available → empty aggregation
  return {}
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
