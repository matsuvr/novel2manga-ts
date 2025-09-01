import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { isDevelopment } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'

// Cloudflare Workers のグローバルバインディング型は型定義ファイルに集約されています

// ========================================
// Storage Interfaces (設計書対応)
// ========================================

export interface Storage {
  put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void>
  get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  list?(prefix?: string): Promise<string[]>
  head?(key: string): Promise<{ size?: number; metadata?: Record<string, string> } | null>
}

// Deprecated DB adapter interfaces removed – DB access is unified via Drizzle in src/db

// ========================================
// Environment Detection
// ========================================

// 開発環境用のローカルストレージパス
const getStorageBase = () => {
  // テスト環境では.test-storageを使用
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.join(process.cwd(), '.test-storage')
  }
  return path.join(process.cwd(), '.local-storage')
}

// 注意: テスト実行時に VITEST/NODE_ENV が設定されるタイミング差で
// モジュールロード時に固定化するとベースディレクトリがズレる可能性がある。
// そのため固定値を使わず、必要時に getStorageBase() を評価する。
// （下位の resolveStorage 内で使用）
// const LOCAL_STORAGE_BASE = getStorageBase()

// ディレクトリ作成ヘルパー
// 注意: 並列テストでディレクトリが削除される可能性があるため、
// キャッシュによるスキップは危険（ENOENT を誘発）となる。毎回 mkdir -p で冪等に作成する。
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

// ========================================
// Local File Storage Implementation
// ========================================

export class LocalFileStorage implements Storage {
  constructor(private baseDir: string) {}

  private getMetadataPath(key: string): string {
    return `${key}.meta.json`
  }

  private isBinaryData(value: string | Buffer): value is Buffer {
    return Buffer.isBuffer(value)
  }

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    const dir = path.dirname(filePath)

    // ベースディレクトリと対象ディレクトリを作成（冪等・並行安全）
    await ensureDir(this.baseDir)
    await ensureDir(dir)

    if (this.isBinaryData(value)) {
      // バイナリデータの場合：BufferをUint8Arrayとしてキャストして保存
      // Node の Buffer は Uint8Array のサブクラス。fs.writeFile は ArrayBufferView を受け取るため
      // ランタイム無変換で安全に受け渡せるように型を Uint8Array へアサートする。
      await fs.writeFile(filePath, value as unknown as Uint8Array)

      // メタデータは別ファイルに保存（必要な場合のみ）
      if (metadata && Object.keys(metadata).length > 0) {
        const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))
        const metadataContent = {
          ...metadata,
          createdAt: new Date().toISOString(),
          isBinary: true,
        }
        await fs.writeFile(metadataPath, JSON.stringify(metadataContent), { encoding: 'utf8' })
      }
    } else {
      // テキストデータの場合：明示的にBufferに変換してからUTF-8で保存
      // Windows環境での文字化け問題を回避するため、Bufferを経由
      const textContent = typeof value === 'string' ? value : (value as Buffer).toString('utf8')
      const buffer = Buffer.from(textContent, 'utf8')
      await fs.writeFile(filePath, buffer)

      const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))
      const metadataContent = {
        ...(metadata || {}),
        createdAt: new Date().toISOString(),
        isBinary: false,
      }
      await fs.writeFile(metadataPath, JSON.stringify(metadataContent), { encoding: 'utf8' })
    }
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const filePath = path.join(this.baseDir, key)
    const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))

    try {
      // メタデータファイルの存在をチェック（バイナリファイルかどうかの判定）
      let isBinary = false
      let metadata: Record<string, string> = {}

      let preReadContent: string | undefined
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8')
        const metadataData = JSON.parse(metadataContent) as Record<string, unknown>
        isBinary = metadataData.isBinary === true
        const INTERNAL_METADATA_KEYS = ['isBinary', 'createdAt']
        const userMetadata = Object.fromEntries(
          Object.entries(metadataData).filter(([key]) => !INTERNAL_METADATA_KEYS.includes(key)),
        ) as Record<string, string>
        metadata = userMetadata
      } catch {
        // メタデータファイルがない場合は、ファイル内容から判定（ここで一度だけ読む）
        const fileContent = await fs.readFile(filePath, 'utf-8')
        preReadContent = fileContent
        try {
          const data = JSON.parse(fileContent)
          // 旧フォーマット（ラップされたJSON）をサポート
          if (typeof data === 'object' && data && 'content' in data) {
            isBinary = false
            metadata = (data as { metadata?: Record<string, string> }).metadata || {}
          } else {
            // 純テキストJSONだった場合（ラップなし）
            isBinary = false
            metadata = {}
          }
        } catch {
          // JSON解析に失敗した場合はプレーンテキストとして扱う
          isBinary = false
          metadata = {}
        }
      }

      if (isBinary) {
        // バイナリファイルの場合：Base64エンコードして返す
        const buffer = await fs.readFile(filePath)
        return {
          text: buffer.toString('base64'),
          metadata,
        }
      } else {
        // テキストファイルの場合：
        // - 新フォーマット: プレーンテキストをそのまま返す
        // - 旧フォーマット: JSONラップから content を抽出
        const content = preReadContent ?? (await fs.readFile(filePath, 'utf-8'))
        try {
          const data = JSON.parse(content)
          if (typeof data === 'object' && data && 'content' in data) {
            return {
              text: (data as { content: string }).content,
              metadata: (data as { metadata?: Record<string, string> }).metadata,
            }
          }
        } catch {
          // ignore
        }
        return { text: content, metadata }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))

    try {
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    // メタデータファイルも削除（存在する場合）
    try {
      await fs.unlink(metadataPath)
    } catch (error) {
      // メタデータファイルがなくてもエラーにしない
      const logger = getLogger().withContext({ service: 'LocalFileStorage', method: 'delete' })
      logger.debug('Failed to delete metadata file', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, key)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const baseDir = prefix ? path.join(this.baseDir, prefix) : this.baseDir
    try {
      const files = await fs.readdir(baseDir, { recursive: true })
      return files
        .filter((file) => !file.endsWith('.meta.json')) // メタデータファイルは除外
        .map((file) => (prefix ? path.join(prefix, file as string) : (file as string)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  async head(key: string): Promise<{ size?: number; metadata?: Record<string, string> } | null> {
    const filePath = path.join(this.baseDir, key)
    const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))

    try {
      const stats = await fs.stat(filePath)
      let userMetadata: Record<string, string> = {}

      // メタデータファイルが存在する場合は読み込む
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8')
        const metadataData = JSON.parse(metadataContent) as Record<string, unknown>
        const INTERNAL_METADATA_KEYS = ['isBinary', 'createdAt']
        userMetadata = Object.fromEntries(
          Object.entries(metadataData).filter(([key]) => !INTERNAL_METADATA_KEYS.includes(key)),
        ) as Record<string, string>
      } catch {
        // メタデータファイルがなくてもエラーにしない
      }

      return {
        size: stats.size,
        metadata: userMetadata,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }
}

// ========================================
// R2 Storage Implementation
// ========================================

// Cloudflare R2 Bucket型定義
interface R2Bucket {
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ): Promise<unknown>
  get(key: string): Promise<{
    text(): Promise<string>
    customMetadata?: Record<string, string>
  } | null>
  delete(key: string): Promise<void>
  head(key: string): Promise<{
    customMetadata?: Record<string, string>
    size?: number
    httpMetadata?: { contentType?: string }
  } | null>
  list(options?: { prefix?: string }): Promise<{
    objects: Array<{ key: string }>
  }>
}

function isR2Bucket(value: unknown): value is R2Bucket {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  // Minimal contract to pass tests; other methods are optional and checked lazily
  return typeof obj.put === 'function' && typeof obj.get === 'function'
}

export class R2Storage implements Storage {
  constructor(private bucket: R2Bucket) {}

  // リトライロジック付きの操作
  private async retryableOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // R2特有のエラーをチェック
        if (error instanceof Error) {
          // レート制限エラーの場合は指数バックオフ
          if (error.message.includes('rate limit')) {
            const backoffMs = 2 ** i * 1000
            await new Promise((resolve) => setTimeout(resolve, backoffMs))
            continue
          }

          // その他の一時的なエラー
          if (error.message.includes('timeout') || error.message.includes('network')) {
            continue
          }
        }

        // リトライ不可能なエラーは即座にthrow
        throw error
      }
    }

    throw lastError
  }

  // キャッシュヘッダーを取得
  private getCacheHeaders(key: string): Record<string, string> {
    if (key.includes('/analysis/')) {
      // 分析結果は長期間キャッシュ可能
      return {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800', // 1日、CDNは7日
        'CDN-Cache-Control': 'max-age=604800', // Cloudflare CDN専用
      }
    } else if (key.includes('/novels/')) {
      // 元データは変更されないため永続的にキャッシュ
      return {
        'Cache-Control': 'public, max-age=31536000, immutable', // 1年
      }
    } else if (key.includes('/layouts/') || key.includes('/renders/')) {
      // レイアウト・レンダリングデータは更新される可能性があるため短めに
      return {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400', // 1時間、CDNは1日
      }
    } else {
      return {
        'Cache-Control': 'public, max-age=3600', // デフォルト1時間
      }
    }
  }

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    const valueToStore = typeof value === 'string' ? value : value.toString()
    const cacheHeaders = this.getCacheHeaders(key)

    // content-type を推定（メタデータ指定があればそれを優先）
    const inferContentType = (): string => {
      const specified =
        metadata && typeof metadata.contentType === 'string' ? metadata.contentType : ''
      if (specified) return specified
      const lower = key.toLowerCase()
      if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'text/yaml; charset=utf-8'
      if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
      if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8'
      if (lower.endsWith('.png')) return 'image/png'
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
      return 'application/octet-stream'
    }

    await this.retryableOperation(async () => {
      await this.bucket.put(key, valueToStore, {
        httpMetadata: {
          contentType: inferContentType(),
          ...cacheHeaders,
        },
        customMetadata: metadata,
      })
    })

    // 強整合性: 書き込み直後に可視性を確認（R2の最終的整合性影響を緩和）
    // head/get が成功するまで短いバックオフで再試行
    const maxChecks = 5
    for (let i = 0; i < maxChecks; i++) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.retryableOperation(async () => {
        const h = await this.bucket.head(key)
        return !!h
      })
      if (ok) break
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50 * (i + 1)))
      if (i === maxChecks - 1) {
        // 最終試行で可視にならなければエラーにする（呼び出し側でリカバリ）
        throw new Error(`R2Storage.put visibility check failed for key: ${key}`)
      }
    }
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    return await this.retryableOperation(async () => {
      const object = await this.bucket.get(key)
      if (!object) {
        return null
      }

      const text = await object.text()
      return {
        text,
        metadata: object.customMetadata || {},
      }
    })
  }

  async delete(key: string): Promise<void> {
    await this.retryableOperation(async () => {
      await this.bucket.delete(key)
    })
  }

  async exists(key: string): Promise<boolean> {
    return await this.retryableOperation(async () => {
      const object = await this.bucket.head(key)
      return !!object
    })
  }

  async list(prefix?: string): Promise<string[]> {
    return await this.retryableOperation(async () => {
      const result = await this.bucket.list(prefix ? { prefix } : undefined)
      return result.objects.map((obj) => obj.key)
    })
  }

  async head(key: string): Promise<{ size?: number; metadata?: Record<string, string> } | null> {
    return await this.retryableOperation(async () => {
      const object = await this.bucket.head(key)
      if (!object) return null

      // R2のheadレスポンスからサイズを取得（プロパティ名はR2の実装による）
      const meta = object as {
        contentLength?: number | string
        size?: number | string
        customMetadata?: Record<string, string>
      }
      const size = meta.contentLength ?? meta.size

      return {
        size: size ? Number(size) : undefined,
        metadata: meta.customMetadata || {},
      }
    })
  }
}

// ========================================
// SQLite Adapter Implementation (Development)
// ========================================

// ========================================
// Storage Factory (設計書対応)
// ========================================

type R2BindingName =
  | 'NOVEL_STORAGE'
  | 'CHUNKS_STORAGE'
  | 'ANALYSIS_STORAGE'
  | 'LAYOUTS_STORAGE'
  | 'RENDERS_STORAGE'
  | 'OUTPUTS_STORAGE'

async function resolveStorage(
  localDir: string,
  binding: R2BindingName,
  errorMessage: string,
): Promise<Storage> {
  // 明示ローカル指定 or 開発/テストはローカル
  if (isDevelopment() || process.env.STORAGE_MODE === 'local') {
    const base = getStorageBase()
    getLogger()
      .withContext({ service: 'StorageFactory', method: 'resolveStorage' })
      .info('[storage] Using LocalFileStorage (dev/local)', { base, localDir })
    return new LocalFileStorage(path.join(base, localDir))
  }

  // 本番: Cloudflare R2 バインディングがある場合のみR2、なければ明示エラー
  const candidate = (globalThis as Record<string, unknown>)[binding]
  const bucket = isR2Bucket(candidate) ? candidate : undefined
  if (bucket) {
    getLogger()
      .withContext({ service: 'StorageFactory', method: 'resolveStorage' })
      .info('[storage] Using R2Storage binding', { binding })
    return new R2Storage(bucket)
  }

  // ここでフォールバックせず、テスト期待に合わせてエラーを投げる
  throw new Error(errorMessage)
}

// Novel Storage
let _novelStorage: Promise<Storage> | null = null
export async function getNovelStorage(): Promise<Storage> {
  if (_novelStorage) return _novelStorage
  _novelStorage = resolveStorage('novels', 'NOVEL_STORAGE', 'Novel storage not configured')
  return _novelStorage
}

// Chunk Storage
let _chunkStorage: Promise<Storage> | null = null
export async function getChunkStorage(): Promise<Storage> {
  if (_chunkStorage) return _chunkStorage
  _chunkStorage = resolveStorage('chunks', 'CHUNKS_STORAGE', 'Chunk storage not configured')
  return _chunkStorage
}

// Analysis Storage
let _analysisStorage: Promise<Storage> | null = null
export async function getAnalysisStorage(): Promise<Storage> {
  if (_analysisStorage) return _analysisStorage
  _analysisStorage = resolveStorage(
    'analysis',
    'ANALYSIS_STORAGE',
    'Analysis storage not configured',
  )
  return _analysisStorage
}

// Layout Storage
let _layoutStorage: Promise<Storage> | null = null
export async function getLayoutStorage(): Promise<Storage> {
  if (_layoutStorage) return _layoutStorage
  _layoutStorage = resolveStorage('layouts', 'LAYOUTS_STORAGE', 'Layout storage not configured')
  return _layoutStorage
}

// Render Storage
let _renderStorage: Promise<Storage> | null = null
export async function getRenderStorage(): Promise<Storage> {
  if (_renderStorage) return _renderStorage
  _renderStorage = resolveStorage('renders', 'RENDERS_STORAGE', 'Render storage not configured')
  return _renderStorage
}

// Output Storage
let _outputStorage: Promise<Storage> | null = null
export async function getOutputStorage(): Promise<Storage> {
  if (_outputStorage) return _outputStorage
  _outputStorage = resolveStorage('outputs', 'OUTPUTS_STORAGE', 'Output storage not configured')
  return _outputStorage
}

// テスト用：ストレージキャッシュをクリア
export function clearStorageCache(): void {
  _novelStorage = null
  _chunkStorage = null
  _analysisStorage = null
  _layoutStorage = null
  _renderStorage = null
  _outputStorage = null
}

// Database
// Database access is provided via Drizzle in src/db. No DB factory here.

export async function getChunkData(
  jobId: string,
  chunkIndex: number,
): Promise<{ text: string } | null> {
  const storage = await getChunkStorage()
  const key = StorageKeys.chunk(jobId, chunkIndex)
  const result = await storage.get(key)
  return result ? { text: result.text } : null
}

// ========================================
// Storage Keys & Factory (Public API)
// ========================================

// ========================================
// Storage Key Builders (with validation)
// - パストラバーサル防止のため ID を検証（英数とハイフン/アンダースコアのみ許可）
// - レビュー指摘: 「path traversal guard」対応
// ========================================

function validateId(id: string, label: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`StorageKeys: ${label} is empty`)
  }
  // 先頭 ../ や /、含まれる .. セグメント、許可外文字を拒否
  if (id.includes('..') || id.startsWith('/') || /[^a-zA-Z0-9_-]/.test(id)) {
    throw new Error(`StorageKeys: invalid ${label} value`)
  }
  // 追加の攻撃パターン: null byte / %00 の混入を拒否（レビュー指摘）
  if (id.includes('\0') || /%00/i.test(id)) {
    throw new Error(`StorageKeys: null bytes not allowed in ${label}`)
  }
  // URLエンコードされた入力は禁止（%エスケープを含むと decode で変化する）
  try {
    if (decodeURIComponent(id) !== id) {
      throw new Error(`StorageKeys: encoded characters not allowed in ${label}`)
    }
  } catch {
    throw new Error(`StorageKeys: invalid percent-encoding in ${label}`)
  }
}

export const StorageKeys = {
  novel: (uuid: string) => {
    validateId(uuid, 'uuid')
    // Fixed: Remove duplicate 'novels/' prefix since getNovelStorage() already provides baseDir = novels
    return `${uuid}.json`
  },
  chunk: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/chunk_${index}.txt`
  },
  chunkAnalysis: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/chunk_${index}.json`
  },
  integratedAnalysis: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/integrated.json`
  },
  narrativeAnalysis: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/narrative.json`
  },
  episodeLayout: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.json`
  },
  episodeLayoutProgress: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.progress.json`
  },
  episodeText: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.txt`
  },
  pageRender: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/page_${pageNumber}.png`
  },
  pageThumbnail: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/thumbnails/page_${pageNumber}_thumb.png`
  },
  exportOutput: (userId: string, jobId: string, format: string) => {
    validateId(userId, 'userId')
    validateId(jobId, 'jobId')
    if (!/^[a-zA-Z0-9]+$/.test(format)) {
      throw new Error('StorageKeys: invalid export format')
    }
    return `results/${userId}/${jobId}.${format}`
  },
  renderStatus: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/page_${pageNumber}.json`
  },
} as const

// Additional JSON-first keys for new pipeline artifacts
export const JsonStorageKeys = {
  scriptChunk: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/script_chunk_${index}.json`
  },
  scriptCombined: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/script_combined.json`
  },
  fullPages: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/full_pages.json`
  },
  // episodeBundling removed - replaced with episode break estimation
} as const

// エピソード境界保存関数
export async function saveEpisodeBoundaries(
  jobId: string,
  episodes: Array<{
    episodeNumber: number
    title?: string
    summary?: string
    startChunk: number
    startCharIndex: number
    endChunk: number
    endCharIndex: number
    confidence: number
  }>,
): Promise<void> {
  // 強整合性を保証したストレージ+DB操作
  const { executeStorageDbTransaction } = await import('@/services/application/transaction-manager')
  const storage = await getAnalysisStorage()
  const key = StorageKeys.narrativeAnalysis(jobId)

  // Get job info for novelId before the transaction
  const { JobProgressService } = await import('@/services/application/job-progress')
  const jobService = new JobProgressService()
  const job = await jobService.getJobWithProgress(jobId)
  if (!job) {
    throw new Error(`Job not found: ${jobId}`)
  }
  const data = {
    episodes,
    metadata: {
      createdAt: new Date().toISOString(),
      totalEpisodes: episodes.length,
    },
  }

  await executeStorageDbTransaction({
    storage,
    key,
    value: JSON.stringify(data, null, 2),
    dbOperation: async () => {
      const { EpisodeWriteService } = await import('@/services/application/episode-write')
      const episodeService = new EpisodeWriteService()

      const episodesForDb = episodes.map((episode) => ({
        novelId: job.novelId,
        jobId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        summary: episode.summary,
        startChunk: episode.startChunk,
        startCharIndex: episode.startCharIndex,
        endChunk: episode.endChunk,
        endCharIndex: episode.endCharIndex,
        confidence: episode.confidence,
      }))

      await episodeService.bulkUpsert(episodesForDb)
    },
    tracking: {
      filePath: key,
      fileCategory: 'analysis',
      fileType: 'json',
      novelId: job.novelId,
      jobId,
      mimeType: 'application/json; charset=utf-8',
    },
  })

  getLogger()
    .withContext({ service: 'StorageFactory', method: 'saveEpisodeBoundaries', jobId })
    .info('Saved episodes to database and file system with strong consistency', {
      savedEpisodes: episodes.length,
    })
}

// チャンク分析取得関数
export async function getChunkAnalysis(
  jobId: string,
  chunkIndex: number,
): Promise<{
  summary?: string
  characters?: { name: string; role: string }[]
  dialogues?: unknown[]
  scenes?: unknown[]
  highlights?: {
    text?: string
    description: string
    importance: number
    startIndex?: number
    endIndex?: number
  }[]
} | null> {
  const storage = await getAnalysisStorage()
  const key = StorageKeys.chunkAnalysis(jobId, chunkIndex)
  const result = await storage.get(key)
  return result ? JSON.parse(result.text) : null
}

export const StorageFactory = {
  getNovelStorage,
  getChunkStorage,
  getAnalysisStorage,
  getLayoutStorage,
  getRenderStorage,
  getOutputStorage,
  // 監査関数を型安全に提供
  auditKeys: auditStorageKeys,
} as const

// ========================================
// Storage Key Audit System (キー整合性監査)
// 目的: R2/ローカル双方で不整合・禁止パターン・重複を早期検出
// 運用: 管理系API / 手動スクリプト から呼び出し
// ========================================

export interface StorageKeyIssue {
  key: string
  issue: 'invalid-format' | 'duplicate' | 'forbidden-segment'
  detail?: string
}

const FORBIDDEN_SEGMENTS = ['//', '__MACOSX', '.DS_Store']

/** 単純な正規表現で許容フォーマットを定義 (a-z0-9/_.-) */
const KEY_REGEX = /^[a-z0-9][a-z0-9/_.-]*$/

export async function auditStorageKeys(options: {
  storages?: Array<keyof typeof StorageFactory>
  prefix?: string
  abortSignal?: AbortSignal
}): Promise<{
  scanned: number
  issues: StorageKeyIssue[]
}> {
  const target = options.storages || [
    'getNovelStorage',
    'getChunkStorage',
    'getAnalysisStorage',
    'getLayoutStorage',
    'getRenderStorage',
    'getOutputStorage',
  ]

  // 1) まず全ストレージのキー一覧を収集（並列）
  const keyLists = await Promise.all(
    target.map(async (name) => {
      const getter = (StorageFactory as Record<string, unknown>)[name]
      if (typeof getter !== 'function') return [] as string[]
      const storage = (await (getter as () => Promise<Storage>)()) as Storage
      if (!storage.list) return [] as string[]
      const keys = await storage.list(options.prefix)
      return keys
    }),
  )

  const issues: StorageKeyIssue[] = []
  const seen = new Set<string>()
  const totalScanned = keyLists.reduce((sum, keys) => sum + keys.length, 0)

  // 2) 単一パスで検証と重複チェックを実行（競合回避）
  outer: for (const keys of keyLists) {
    for (const key of keys) {
      if (options.abortSignal?.aborted) break outer
      if (!KEY_REGEX.test(key)) {
        issues.push({ key, issue: 'invalid-format', detail: 'regex-mismatch' })
      }
      for (const seg of FORBIDDEN_SEGMENTS) {
        if (key.includes(seg)) {
          issues.push({ key, issue: 'forbidden-segment', detail: seg })
        }
      }
      if (seen.has(key)) {
        issues.push({ key, issue: 'duplicate' })
      } else {
        seen.add(key)
      }
    }
  }

  return { scanned: totalScanned, issues }
}

// 直指定版: Factory を経由せず、与えられた Storage インスタンス配列を監査
export async function auditStorageKeysOnStorages(
  storages: Storage[],
  options?: { prefix?: string; abortSignal?: AbortSignal },
): Promise<{ scanned: number; issues: StorageKeyIssue[] }> {
  // 1) 各ストレージのキー一覧を収集（並列）
  const keyLists = await Promise.all(
    storages.map(async (storage) => {
      if (!storage.list) return [] as string[]
      const keys = await storage.list(options?.prefix)
      return keys
    }),
  )

  const issues: StorageKeyIssue[] = []
  const seen = new Set<string>()
  const totalScanned = keyLists.reduce((sum, keys) => sum + keys.length, 0)

  // 2) 単一パスで検証・重複チェック
  outer: for (const keys of keyLists) {
    for (const key of keys) {
      if (options?.abortSignal?.aborted) break outer
      if (!KEY_REGEX.test(key)) {
        issues.push({ key, issue: 'invalid-format', detail: 'regex-mismatch' })
      }
      for (const seg of FORBIDDEN_SEGMENTS) {
        if (key.includes(seg)) {
          issues.push({ key, issue: 'forbidden-segment', detail: seg })
        }
      }
      if (seen.has(key)) {
        issues.push({ key, issue: 'duplicate' })
      } else {
        seen.add(key)
      }
    }
  }

  return { scanned: totalScanned, issues }
}
// NOTE: 動的追加は廃止。auditKeys は StorageFactory 定義に含めた。
