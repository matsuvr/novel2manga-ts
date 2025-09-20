/**
 * 統合テスト用ストレージヘルパー
 * インメモリストレージを提供し、実際のファイルI/Oをモック
 */

import type { Storage } from '@/utils/storage'

/**
 * テスト用インメモリストレージの実装
 */
export class TestMemoryStorage implements Storage {
  private storage: Map<string, { text: string; metadata?: Record<string, string> }> = new Map()

  async get(path: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const value = this.storage.get(path)
    if (!value) return null
    return value
  }

  async put(path: string, data: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    if (typeof data === 'string') {
      this.storage.set(path, { text: data, metadata })
      return
    }
    if (data instanceof Buffer) {
      this.storage.set(path, { text: data.toString('utf-8'), metadata })
      return
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.storage.has(path)
  }

  async delete(path: string): Promise<void> {
    this.storage.delete(path)
  }

  async list(prefix?: string): Promise<string[]> {
    if (!prefix) {
      return Array.from(this.storage.keys())
    }
    return Array.from(this.storage.keys()).filter((key) => key.startsWith(prefix))
  }

  // テスト用ヘルパーメソッド
  clear(): void {
    this.storage.clear()
  }

  size(): number {
    return this.storage.size
  }

  has(path: string): boolean {
    return this.storage.has(path)
  }

  // デバッグ用
  dump(): Record<string, unknown> {
    return Object.fromEntries(this.storage.entries())
  }
}

/**
 * テスト用ストレージファクトリー
 */
export class TestStorageFactory {
  private novelStorage = new TestMemoryStorage()
  private chunkStorage = new TestMemoryStorage()
  private analysisStorage = new TestMemoryStorage()
  private layoutStorage = new TestMemoryStorage()
  private renderStorage = new TestMemoryStorage()
  private outputStorage = new TestMemoryStorage()

  async getNovelStorage(): Promise<TestMemoryStorage> {
    return this.novelStorage
  }

  async getChunkStorage(): Promise<TestMemoryStorage> {
    return this.chunkStorage
  }

  async getAnalysisStorage(): Promise<TestMemoryStorage> {
    return this.analysisStorage
  }

  async getLayoutStorage(): Promise<TestMemoryStorage> {
    return this.layoutStorage
  }

  async getRenderStorage(): Promise<TestMemoryStorage> {
    return this.renderStorage
  }

  async getOutputStorage(): Promise<TestMemoryStorage> {
    return this.outputStorage
  }

  // テスト用ヘルパー
  clearAll(): void {
    this.novelStorage.clear()
    this.chunkStorage.clear()
    this.analysisStorage.clear()
    this.layoutStorage.clear()
    this.renderStorage.clear()
    this.outputStorage.clear()
  }

  // デバッグ用
  dumpAll(): Record<string, unknown> {
    return {
      novels: this.novelStorage.dump(),
      chunks: this.chunkStorage.dump(),
      analysis: this.analysisStorage.dump(),
      layouts: this.layoutStorage.dump(),
      renders: this.renderStorage.dump(),
      outputs: this.outputStorage.dump(),
    }
  }
}

/**
 * テスト用ストレージデータファクトリー
 */
export class TestStorageDataFactory {
  constructor(private storageFactory: TestStorageFactory) {}

  async seedNovelText(
    novelId: string,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const storage = await this.storageFactory.getNovelStorage()
    const meta: Record<string, string> = Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, String(v)]),
    )
    const payload = { text, metadata: meta }
    await storage.put(`${novelId}.json`, JSON.stringify(payload))
  }

  async seedChunkText(jobId: string, chunkIndex: number, text: string): Promise<void> {
    const storage = await this.storageFactory.getChunkStorage()
    await storage.put(`${jobId}/chunks/${chunkIndex}.txt`, text)
  }

  async seedChunkAnalysis(
    jobId: string,
    chunkIndex: number,
    analysis: Record<string, unknown>,
  ): Promise<void> {
    const storage = await this.storageFactory.getAnalysisStorage()
    await storage.put(`${jobId}/analysis/chunk-${chunkIndex}.json`, JSON.stringify(analysis))
  }
}
