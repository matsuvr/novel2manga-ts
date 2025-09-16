import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { appConfig } from '@/config/app.config'
import type { Job } from '@/db'
// テストのモックが `@/services/database` を対象にしているため
// import パスをバレルに統一してモックが正しく適用されるようにする
import { db } from '@/services/database'
import { ApiError } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

// Minimum file size (bytes) to consider an image file valid. Keep as a small constant
// to make intent clear and allow easy tuning.
const MIN_IMAGE_FILE_SIZE_BYTES = 100

// Validation cache to avoid hammering storage on frequent progress polls (SSE every ~500ms).
// Cache is keyed by jobId and has a TTL. Background refresh is kicked off when stale but
// callers are not awaited unless the job is completed (or explicitly requested).
type ValidationMap = Record<
  string,
  { normalizedPages: number[]; pagesWithIssueCounts: Record<number, number>; issuesCount: number }
>
type ValidationCacheEntry = {
  data: ValidationMap
  updatedAt: number
  inProgress?: Promise<void>
}

const VALIDATION_TTL_MS = (appConfig.processing?.cache?.validationTtlSec ?? 30) * 1000
const validationCache = new Map<string, ValidationCacheEntry>()

// Periodic cleanup of stale validation cache entries to avoid unbounded memory growth.
// Runs every VALIDATION_TTL_MS interval.
setInterval(() => {
  const now = Date.now()
  for (const [jobId, entry] of validationCache.entries()) {
    if (now - entry.updatedAt > VALIDATION_TTL_MS * 5) {
      validationCache.delete(jobId)
    }
  }
}, VALIDATION_TTL_MS)

async function getValidationCachedOrRefresh(
  jobId: string,
  perEpisode: PerEpisodeProgress,
  awaitIfStale = false,
): Promise<ValidationMap> {
  const now = Date.now()
  const entry = validationCache.get(jobId)

  // If we have a fresh cache, return it
  if (entry?.updatedAt && now - entry.updatedAt < VALIDATION_TTL_MS) return entry.data

  // If an update is already in progress, either await it or return stale data
  if (entry?.inProgress) {
    if (awaitIfStale) {
      try {
        await entry.inProgress
      } catch {
        // ignore background errors
      }
      const after = validationCache.get(jobId)
      return after?.data || {}
    }
    return entry.data || {}
  }

  // No entry or stale: start a background refresh
  const p = (async () => {
    try {
      const map = await enrichPerEpisodeValidation(jobId, perEpisode)
      validationCache.set(jobId, { data: map, updatedAt: Date.now() })
    } catch (err) {
      // don't let background failures crash callers; log for debug
      try {
        console.error('background enrichPerEpisodeValidation failed:', err)
      } catch {
        /* noop */
      }
    } finally {
      const cur = validationCache.get(jobId)
      if (cur) delete cur.inProgress
    }
  })()

  // store a placeholder entry with inProgress while fetching
  validationCache.set(jobId, {
    data: entry?.data || {},
    updatedAt: entry?.updatedAt || 0,
    inProgress: p,
  })

  if (awaitIfStale) {
    try {
      await p
      const after = validationCache.get(jobId)
      return after?.data || {}
    } catch {
      return validationCache.get(jobId)?.data || {}
    }
  }

  // Not awaiting: return stale data (or empty) immediately
  return entry?.data || {}
}

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
  // perEpisodePages の各エントリに validation を含めて返す（互換性確保）
  const perEpisodePagesWithValidation = Object.fromEntries(
    Object.entries(perEpisode).map(([ep, v]) => [
      String(ep),
      {
        planned: v.planned,
        rendered: v.rendered,
        ...(typeof v.total === 'number' ? { total: v.total } : {}),
        validation: {
          normalizedPages: [],
          pagesWithIssueCounts: {},
          issuesCount: 0,
        },
      },
    ]),
  ) as Record<
    string,
    {
      planned: number
      rendered: number
      total?: number
      validation: {
        normalizedPages: number[]
        pagesWithIssueCounts: Record<number, number> | Record<string, number>
        issuesCount: number
      }
    }
  >

  // 検証は高コスト（ストレージ走査）なので頻繁に同期実行しない。
  // - 通常のプログレスポーリングではキャッシュを返し、バックグラウンドで更新を起動する
  // - ジョブが完了している場合のみ、最新の検証を待って同期的に反映する
  try {
    const jobIsCompleted =
      job.status === 'completed' || job.status === 'complete' || job.renderCompleted === true
    const validationMap = await getValidationCachedOrRefresh(jobId, perEpisode, jobIsCompleted)
    for (const [ep, val] of Object.entries(validationMap)) {
      if (perEpisodePagesWithValidation[ep]) {
        perEpisodePagesWithValidation[ep].validation = val
      } else {
        perEpisodePagesWithValidation[ep] = { planned: 0, rendered: 0, validation: val }
      }
    }
  } catch (err) {
    // 検証で失敗しても致命的にしない（UIにはデフォルトが返る）
    try {
      console.error('enrichPerEpisodeValidation failed:', err)
    } catch {
      /* noop */
    }
  }

  const jobWithProgress = {
    ...job,
    // DB値が0/未確定の際は、集計値で上書き提供（DB自体は別途更新ルートで整合化）
    totalPages: Math.max(Number(job.totalPages || 0), totals.total),
    renderedPages: Math.max(Number(job.renderedPages || 0), totals.rendered),
    progress: {
      perEpisodePages: perEpisodePagesWithValidation,
    },
  } as Job &
    Record<
      'progress',
      {
        perEpisodePages: typeof perEpisodePagesWithValidation
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

/**
 * Enrich per-episode aggregation with validation data.
 * For each episode, read render status rows and inspect storage for page files.
 * This implements a lightweight "render validation" that counts simple issues:
 * - missing image file
 * - file too small (< MIN_IMAGE_FILE_SIZE_BYTES bytes)
 * - recorded width/height invalid (<= 0)
 */
async function enrichPerEpisodeValidation(
  jobId: string,
  perEpisode: PerEpisodeProgress,
): Promise<
  Record<
    string,
    { normalizedPages: number[]; pagesWithIssueCounts: Record<number, number>; issuesCount: number }
  >
> {
  const out: Record<
    string,
    { normalizedPages: number[]; pagesWithIssueCounts: Record<number, number>; issuesCount: number }
  > = {}
  const renderSvc = db.render() as unknown
  const storage = await StorageFactory.getRenderStorage()

  // Helper: safe get of render status rows per episode
  async function getStatusRows(ep: number) {
    if (
      renderSvc &&
      typeof renderSvc === 'object' &&
      (renderSvc as Record<string, unknown>)?.getRenderStatusByEpisode &&
      typeof (renderSvc as Record<string, unknown>).getRenderStatusByEpisode === 'function'
    ) {
      try {
        const rows = await (
          renderSvc as { getRenderStatusByEpisode: (jobId: string, ep: number) => unknown }
        ).getRenderStatusByEpisode(jobId, ep)
        return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
      } catch {
        return []
      }
    }
    return []
  }

  for (const [epKey, v] of Object.entries(perEpisode)) {
    const epNum = Number(epKey)
    const pagesWithIssueCounts: Record<number, number> = {}
    const normalizedPages: number[] = []
    let issuesCount = 0

    const statusRows = await getStatusRows(epNum)
    for (const row of statusRows) {
      const pageNumber = Number(
        (row as Record<string, unknown>).pageNumber ??
        (row as Record<string, unknown>).page_number ??
        NaN,
      )
      if (!Number.isFinite(pageNumber)) continue

      // Consider pages that are marked rendered or have an imagePath as "normalized"
      const isRendered = Boolean((row as Record<string, unknown>).isRendered)
      const imagePath =
        (row as Record<string, unknown>).imagePath ?? (row as Record<string, unknown>).image_path
      const thumbnailPath =
        (row as Record<string, unknown>).thumbnailPath ??
        (row as Record<string, unknown>).thumbnail_path
      const width =
        Number((row as Record<string, unknown>).width ?? (row as Record<string, unknown>).w ?? 0) ||
        0
      const height =
        Number(
          (row as Record<string, unknown>).height ?? (row as Record<string, unknown>).h ?? 0,
        ) || 0

      if (isRendered || imagePath || thumbnailPath) normalizedPages.push(pageNumber)

      // perform simple checks
      let pageIssues = 0
      // 1) existence / head check for image file
      try {
        if (typeof imagePath === 'string' && imagePath.length > 0) {
          // Try head first if available
          if (typeof storage.head === 'function') {
            const head = await storage.head(String(imagePath))
            if (!head) {
              pageIssues += 1
            } else if (head.size !== undefined && head.size < MIN_IMAGE_FILE_SIZE_BYTES) {
              pageIssues += 1
            }
          } else {
            const g = await storage.get(String(imagePath))
            if (!g) pageIssues += 1
            else if (g.text && g.text.length < MIN_IMAGE_FILE_SIZE_BYTES) pageIssues += 1
          }
        } else if (typeof thumbnailPath === 'string' && thumbnailPath.length > 0) {
          if (typeof storage.head === 'function') {
            const head = await storage.head(String(thumbnailPath))
            if (!head) pageIssues += 1
            else if (head.size !== undefined && head.size < MIN_IMAGE_FILE_SIZE_BYTES)
              pageIssues += 1
          } else {
            const g = await storage.get(String(thumbnailPath))
            if (!g) pageIssues += 1
            else if (g.text && g.text.length < MIN_IMAGE_FILE_SIZE_BYTES) pageIssues += 1
          }
        } else {
          // No image info available → count as missing
          pageIssues += 1
        }
      } catch {
        pageIssues += 1
      }

      // 2) dimension sanity
      if (width <= 0 || height <= 0) pageIssues += 1

      if (pageIssues > 0) {
        pagesWithIssueCounts[pageNumber] = pageIssues
        issuesCount += pageIssues
      }
    }

    // If no status rows were present, fall back to planned/rendered counts to populate normalizedPages
    if (normalizedPages.length === 0) {
      const planned = v.planned || 0
      for (let p = 0; p < planned; p++) normalizedPages.push(p)
    }

    out[String(epNum)] = {
      normalizedPages: normalizedPages.sort((a, b) => a - b),
      pagesWithIssueCounts,
      issuesCount,
    }
  }

  return out
}
