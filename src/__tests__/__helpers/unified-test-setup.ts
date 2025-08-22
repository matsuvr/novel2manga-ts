/**
 * 統合テスト環境セットアップ - すべてのストレージテストの根本的な問題を解決
 */
import { vi } from 'vitest'
import type { Database } from '@/types/database'
import type { Storage } from '@/types/storage'

// インメモリストレージの実装
export class UnifiedMemoryStorage implements Storage {
  private storage: Map<string, { text: string; metadata?: Record<string, string> }> = new Map()

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    return this.storage.get(key) || null
  }

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    if (Buffer.isBuffer(value)) {
      this.storage.set(key, { text: value.toString('base64'), metadata })
    } else {
      this.storage.set(key, { text: value, metadata })
    }
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key)
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.storage.keys())
    return prefix ? keys.filter((key) => key.startsWith(prefix)) : keys
  }

  async head(key: string): Promise<{ size?: number; metadata?: Record<string, string> } | null> {
    const entry = this.storage.get(key)
    if (!entry) return null
    return {
      size: Buffer.byteLength(entry.text, 'utf8'),
      metadata: entry.metadata,
    }
  }

  // テスト用ヘルパー
  clear(): void {
    this.storage.clear()
  }

  size(): number {
    return this.storage.size
  }

  dump(): Record<string, unknown> {
    return Object.fromEntries(this.storage.entries())
  }
}

// 統合ストレージファクトリー
export class UnifiedStorageFactory {
  private static instance: UnifiedStorageFactory
  private storages: Map<string, UnifiedMemoryStorage> = new Map()

  static getInstance(): UnifiedStorageFactory {
    if (!this.instance) {
      this.instance = new UnifiedStorageFactory()
    }
    return this.instance
  }

  getStorage(type: string): UnifiedMemoryStorage {
    if (!this.storages.has(type)) {
      this.storages.set(type, new UnifiedMemoryStorage())
    }
    return this.storages.get(type)!
  }

  clearAll(): void {
    for (const storage of this.storages.values()) {
      storage.clear()
    }
    this.storages.clear()
  }

  // 個別のストレージタイプアクセサー
  async getNovelStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('novels')
  }

  async getChunkStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('chunks')
  }

  async getAnalysisStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('analysis')
  }

  async getLayoutStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('layouts')
  }

  async getRenderStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('renders')
  }

  async getOutputStorage(): Promise<UnifiedMemoryStorage> {
    return this.getStorage('outputs')
  }
}

// モックDB実装
export class MockDatabase implements Partial<Database> {
  private jobs: Map<string, any> = new Map()
  private episodes: Map<string, any[]> = new Map()
  private novels: Map<string, any> = new Map()
  private transactionActive = false
  public $client: { exec: any }

  constructor() {
    this.$client = {
      exec: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN IMMEDIATE') {
          if (this.transactionActive) {
            throw new Error('SqliteError: cannot start a transaction within a transaction')
          }
          this.transactionActive = true
        } else if (sql === 'COMMIT') {
          if (!this.transactionActive) {
            throw new Error('SqliteError: cannot commit - no transaction is active')
          }
          this.transactionActive = false
        } else if (sql === 'ROLLBACK') {
          if (!this.transactionActive) {
            throw new Error('SqliteError: cannot rollback - no transaction is active')
          }
          this.transactionActive = false
        }
      }),
    }
  }

  async ensureNovel(id: string, data?: any): Promise<void> {
    this.novels.set(id, data || { id })
  }

  async updateJobStatus(jobId: string, status: string): Promise<void> {
    const job = this.jobs.get(jobId) || {}
    this.jobs.set(jobId, { ...job, status })
  }

  async getJob(jobId: string): Promise<any> {
    return this.jobs.get(jobId) || null
  }

  async getEpisodesByJobId(jobId: string): Promise<any[]> {
    return this.episodes.get(jobId) || []
  }

  clear(): void {
    this.jobs.clear()
    this.episodes.clear()
    this.novels.clear()
    this.transactionActive = false
    // スパイ関数をクリアするが、関数自体は保持
    if (this.$client.exec && typeof this.$client.exec.mockClear === 'function') {
      this.$client.exec.mockClear()
    }
  }
}

// グローバルモックインスタンス（スコープ問題を解決するため）
let globalMockDb: MockDatabase

// 統合セットアップ関数
export function setupUnifiedTestEnvironment() {
  const factory = UnifiedStorageFactory.getInstance()
  globalMockDb = new MockDatabase()

  // すべてのモックを一箇所でセットアップ
  vi.mock('@/config', async (importOriginal) => {
    const actual = (await importOriginal()) as any
    return {
      ...actual,
      isDevelopment: () => true,
      getDatabaseConfig: () => ({ url: 'test://memory' }),
    }
  })

  vi.mock('@/utils/storage', async (importOriginal) => {
    const actual = (await importOriginal()) as any
    const testFactory = UnifiedStorageFactory.getInstance()
    return {
      ...actual,
      StorageFactory: {
        getNovelStorage: () => testFactory.getNovelStorage(),
        getChunkStorage: () => testFactory.getChunkStorage(),
        getAnalysisStorage: () => testFactory.getAnalysisStorage(),
        getLayoutStorage: () => testFactory.getLayoutStorage(),
        getRenderStorage: () => testFactory.getRenderStorage(),
        getOutputStorage: () => testFactory.getOutputStorage(),
      },
    }
  })

  vi.mock('@/db/index', () => ({
    getDatabase: () => globalMockDb,
  }))

  vi.mock('@/services/application/storage-tracker', () => ({
    recordStorageFile: vi.fn().mockResolvedValue(undefined),
  }))

  return {
    factory,
    mockDb: globalMockDb,
    cleanup: () => {
      factory.clearAll()
      globalMockDb.clear()
    },
  }
}

// ビフォーイーチセットアップ
export function beforeEachTestSetup() {
  const { cleanup } = setupUnifiedTestEnvironment()
  return cleanup
}
