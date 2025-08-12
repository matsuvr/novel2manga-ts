import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { isDevelopment } from '@/config'

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

const LOCAL_STORAGE_BASE = getStorageBase()

// ディレクトリ作成ヘルパー
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

  private isBinaryData(value: string | Buffer): boolean {
    return Buffer.isBuffer(value)
  }

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    const dir = path.dirname(filePath)

    // ディレクトリ作成を並行化
    await ensureDir(dir)

    if (this.isBinaryData(value)) {
      // バイナリデータの場合：直接ファイルに保存
      await fs.writeFile(filePath, value as Buffer)

      // メタデータは別ファイルに保存（必要な場合のみ）
      if (metadata && Object.keys(metadata).length > 0) {
        const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))
        const metadataContent = {
          ...metadata,
          createdAt: new Date().toISOString(),
          isBinary: true,
        }
        await fs.writeFile(metadataPath, JSON.stringify(metadataContent), 'utf-8')
      }
    } else {
      // テキストデータの場合：シンプルなJSONで保存（インデントなし）
      const data = {
        content: value.toString(),
        metadata: metadata || {},
        createdAt: new Date().toISOString(),
        isBinary: false,
      }
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8')
    }
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const filePath = path.join(this.baseDir, key)
    const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))

    try {
      // メタデータファイルの存在をチェック（バイナリファイルかどうかの判定）
      let isBinary = false
      let metadata: Record<string, string> = {}

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
        // メタデータファイルがない場合は、ファイル内容から判定
        const fileContent = await fs.readFile(filePath, 'utf-8')
        try {
          const data = JSON.parse(fileContent)
          isBinary = data.isBinary || false
          metadata = data.metadata || {}
        } catch {
          // JSON解析に失敗した場合はバイナリとして扱う
          isBinary = true
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
        // テキストファイルの場合：従来通り
        const content = await fs.readFile(filePath, 'utf-8')
        const data = JSON.parse(content)
        return {
          text: data.content,
          metadata: data.metadata,
        }
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
    } catch {
      // メタデータファイルがなくてもエラーにしない
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
      let metadata: Record<string, string> = {}

      // メタデータファイルが存在する場合は読み込む
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8')
        const metadataData = JSON.parse(metadataContent)
        metadata = metadataData.metadata || {}
      } catch {
        // メタデータファイルがなくてもエラーにしない
      }

      return {
        size: stats.size,
        metadata,
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

    await this.retryableOperation(async () => {
      await this.bucket.put(key, valueToStore, {
        httpMetadata: {
          contentType: 'application/json; charset=utf-8',
          ...cacheHeaders,
        },
        customMetadata: metadata,
      })
    })
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    return await this.retryableOperation(async () => {
      const object = await this.bucket.get(key)
      if (!object) return null

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
      const size = (object as any).contentLength || (object as any).size

      return {
        size: size ? Number(size) : undefined,
        metadata: object.customMetadata || {},
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
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, localDir))
  }

  const globalObj = globalThis as unknown as Record<string, unknown>
  const candidate = globalObj[binding]
  const bucket = candidate && typeof candidate === 'object' ? (candidate as R2Bucket) : undefined
  if (!bucket) {
    throw new Error(errorMessage)
  }
  return new R2Storage(bucket)
}

// Novel Storage
export async function getNovelStorage(): Promise<Storage> {
  return resolveStorage('novels', 'NOVEL_STORAGE', 'Novel storage not configured')
}

// Chunk Storage
export async function getChunkStorage(): Promise<Storage> {
  return resolveStorage('chunks', 'CHUNKS_STORAGE', 'Chunk storage not configured')
}

// Analysis Storage
export async function getAnalysisStorage(): Promise<Storage> {
  return resolveStorage('analysis', 'ANALYSIS_STORAGE', 'Analysis storage not configured')
}

// Layout Storage
export async function getLayoutStorage(): Promise<Storage> {
  return resolveStorage('layouts', 'LAYOUTS_STORAGE', 'Layout storage not configured')
}

// Render Storage
export async function getRenderStorage(): Promise<Storage> {
  return resolveStorage('renders', 'RENDERS_STORAGE', 'Render storage not configured')
}

// Output Storage
export async function getOutputStorage(): Promise<Storage> {
  return resolveStorage('outputs', 'OUTPUTS_STORAGE', 'Output storage not configured')
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
}

export const StorageKeys = {
  novel: (uuid: string) => {
    validateId(uuid, 'uuid')
    return `novels/${uuid}.json`
  },
  chunk: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `chunks/${jobId}/chunk_${index}.txt`
  },
  chunkAnalysis: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `analyses/${jobId}/chunk_${index}.json`
  },
  integratedAnalysis: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `analyses/${jobId}/integrated.json`
  },
  narrativeAnalysis: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `analyses/${jobId}/narrative.json`
  },
  episodeLayout: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `layouts/${jobId}/episode_${episodeNumber}.yaml`
  },
  pageRender: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `renders/${jobId}/episode_${episodeNumber}/page_${pageNumber}.png`
  },
  pageThumbnail: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `renders/${jobId}/episode_${episodeNumber}/thumbnails/page_${pageNumber}_thumb.png`
  },
  exportOutput: (jobId: string, format: string) => {
    validateId(jobId, 'jobId')
    if (!/^[a-zA-Z0-9]+$/.test(format)) {
      throw new Error('StorageKeys: invalid export format')
    }
    return `exports/${jobId}/output.${format}`
  },
  renderStatus: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `render-status/${jobId}/episode_${episodeNumber}/page_${pageNumber}.json`
  },
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
    estimatedPages: number
    confidence: number
  }>,
): Promise<void> {
  // ファイルシステムに保存
  const storage = await getAnalysisStorage()
  const key = StorageKeys.narrativeAnalysis(jobId)
  const data = {
    episodes,
    metadata: {
      createdAt: new Date().toISOString(),
      totalEpisodes: episodes.length,
    },
  }
  await storage.put(key, JSON.stringify(data, null, 2))

  // データベースに保存
  const { getDatabaseService } = await import('@/services/db-factory')
  const dbService = getDatabaseService()

  // jobからnovelIdを取得
  const job = await dbService.getJob(jobId)
  if (!job) {
    throw new Error(`Job not found: ${jobId}`)
  }

  // エピソードをデータベースに保存
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
    estimatedPages: episode.estimatedPages,
    confidence: episode.confidence,
  }))

  await dbService.createEpisodes(episodesForDb)

  console.log(`Saved ${episodes.length} episodes to both database and file system`)
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
} as const
