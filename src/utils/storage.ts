import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { isDevelopment } from '@/config'
import { storageBaseDirs } from '@/config/storage-paths.config'
import { getLogger } from '@/infrastructure/logging/logger'

// Platform-specific global binding types were previously provided here; all platform bindings removed.

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

/**
 * ローカルストレージの基底およびサブディレクトリ構造を作成（冪等）
 * - テスト: .test-storage/{novels,chunks,analysis,layouts,renders,outputs}
 * - 開発/本番ローカル: .local-storage/{...}
 */
export async function ensureLocalStorageStructure(): Promise<void> {
  const base = getStorageBase()
  await ensureDir(base)
  const subdirs = Object.values(storageBaseDirs)
  for (const dir of subdirs) {
    await ensureDir(path.join(base, dir))
  }
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

      // メタデータは別ファイルに保存（常に isBinary:true を記録して復元時の誤判定を避ける）
      const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))
      await ensureDir(path.dirname(metadataPath))
      const metadataContent = {
        ...(metadata || {}),
        createdAt: new Date().toISOString(),
        isBinary: true,
      }
      await fs.writeFile(metadataPath, JSON.stringify(metadataContent), { encoding: 'utf8' })
    } else {
      // テキストデータの場合：明示的にBufferに変換してからUTF-8で保存
      // Windows環境での文字化け問題を回避するため、Bufferを経由
      const textContent = typeof value === 'string' ? value : (value as Buffer).toString('utf8')
      const buffer = Buffer.from(textContent, 'utf8')
      await fs.writeFile(filePath, buffer)

      const metadataPath = path.join(this.baseDir, this.getMetadataPath(key))
      await ensureDir(path.dirname(metadataPath))
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
    const startDir = prefix ? path.join(this.baseDir, prefix) : this.baseDir

    async function walk(dir: string, base: string): Promise<string[]> {
      let out: string[] = []
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          out = out.concat(await walk(fullPath, base))
        } else if (entry.isFile()) {
          const rel = path.relative(base, fullPath)
          out.push(rel)
        }
      }
      return out
    }

    try {
      const files = await walk(startDir, this.baseDir)
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
// External object storage support removed
// ========================================

// NOTE:
// This project no longer includes external object storage bindings. Only LocalFileStorage
// is supported by the built-in factory. In production, set STORAGE_MODE=local
// or provide an alternative Storage implementation and wire it into the factory.

// ========================================
// SQLite Adapter Implementation (Development)
// ========================================

// ========================================
// Storage Factory (設計書対応)
// ========================================

async function resolveStorage(localDir: string, errorMessage: string): Promise<Storage> {
  // Only local file storage is supported in this build. Development and
  // explicit local mode use the local storage base. In any other environment
  // we error out with a clear message to avoid accidental reliance on
  // removed platform bindings.
  const base = getStorageBase()
  if (isDevelopment() || process.env.STORAGE_MODE === 'local') {
    getLogger()
      .withContext({ service: 'StorageFactory', method: 'resolveStorage' })
      .info('[storage] Using LocalFileStorage (dev/local)', { base, localDir })
    return new LocalFileStorage(path.join(base, localDir))
  }

  getLogger()
    .withContext({ service: 'StorageFactory', method: 'resolveStorage' })
    .error(
      '[storage] External platform bindings removed from this build; set STORAGE_MODE=local or provide a Storage implementation',
    )

  // Intentionally fail fast to avoid silent misconfiguration.
  throw new Error(errorMessage)
}

// Novel Storage
let _novelStorage: Promise<Storage> | null = null
export async function getNovelStorage(): Promise<Storage> {
  if (_novelStorage) return _novelStorage
  _novelStorage = resolveStorage('novels', 'Novel storage not configured')
  return _novelStorage
}

// Chunk Storage
let _chunkStorage: Promise<Storage> | null = null
export async function getChunkStorage(): Promise<Storage> {
  if (_chunkStorage) return _chunkStorage
  _chunkStorage = resolveStorage('chunks', 'Chunk storage not configured')
  return _chunkStorage
}

// Analysis Storage
let _analysisStorage: Promise<Storage> | null = null
export async function getAnalysisStorage(): Promise<Storage> {
  if (_analysisStorage) return _analysisStorage
  _analysisStorage = resolveStorage('analysis', 'Analysis storage not configured')
  return _analysisStorage
}

// Layout Storage
let _layoutStorage: Promise<Storage> | null = null
export async function getLayoutStorage(): Promise<Storage> {
  if (_layoutStorage) return _layoutStorage
  _layoutStorage = resolveStorage('layouts', 'Layout storage not configured')
  return _layoutStorage
}

// Render Storage
let _renderStorage: Promise<Storage> | null = null
export async function getRenderStorage(): Promise<Storage> {
  if (_renderStorage) return _renderStorage
  _renderStorage = resolveStorage('renders', 'Render storage not configured')
  return _renderStorage
}

// Output Storage
let _outputStorage: Promise<Storage> | null = null
export async function getOutputStorage(): Promise<Storage> {
  if (_outputStorage) return _outputStorage
  _outputStorage = resolveStorage('outputs', 'Output storage not configured')
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
  episodeBoundaries: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episodes.json`
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
  characterMemoryFull: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/character_memory.full.json`
  },
  characterMemoryPrompt: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/character_memory.prompt.json`
  },
  chunkSummary: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/chunk_${index}.summary.json`
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
  const key = StorageKeys.episodeBoundaries(jobId)

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
