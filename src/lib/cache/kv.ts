import { getConfig } from '@/config'

// KVのバインディング型定義
interface KVNamespace {
  get(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' },
  ): Promise<string | ArrayBuffer | ReadableStream | null>
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVPutOptions,
  ): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>
}

interface KVPutOptions {
  expiration?: number
  expirationTtl?: number
  metadata?: Record<string, string>
}

interface KVListResult {
  keys: Array<{ name: string; expiration?: number; metadata?: Record<string, string> }>
  list_complete: boolean
  cursor?: string
}

// メモリキャッシュ（開発環境用）
class MemoryCache {
  private cache: Map<
    string,
    { value: string | ArrayBuffer | ReadableStream; expiration?: number }
  > = new Map()

  async get(
    key: string,
    _options?: { type?: string },
  ): Promise<string | ArrayBuffer | ReadableStream | null> {
    const item = this.cache.get(key)
    if (!item) return null

    if (item.expiration && Date.now() > item.expiration) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: KVPutOptions,
  ): Promise<void> {
    let expiration: number | undefined

    if (options?.expirationTtl) {
      expiration = Date.now() + options.expirationTtl * 1000
    } else if (options?.expiration) {
      expiration = options.expiration * 1000
    }

    this.cache.set(key, { value, expiration })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<KVListResult> {
    const keys = Array.from(this.cache.keys())
      .filter((key) => !options?.prefix || key.startsWith(options.prefix))
      .slice(0, options?.limit || 1000)
      .map((name) => ({ name }))

    return {
      keys,
      list_complete: true,
    }
  }
}

// 開発環境用のメモリキャッシュインスタンス
const memoryCache = new MemoryCache()

// 環境に応じたキャッシュを取得
export function getCache(): KVNamespace | MemoryCache {
  if (process.env.NODE_ENV === 'development') {
    return memoryCache
  }

  // 本番環境：KVを使用
  // @ts-expect-error - KVバインディングはランタイムで利用可能
  if (globalThis.CACHE) {
    // @ts-expect-error - KVバインディングはランタイムで利用可能
    return globalThis.CACHE as KVNamespace
  }

  // フォールバック
  return memoryCache
}

// キャッシュキーの生成ヘルパー
export function generateCacheKey(prefix: string, ...parts: string[]): string {
  return `${prefix}:${parts.join(':')}`
}

// 分析結果のキャッシュキー
export function getAnalysisCacheKey(novelId: string, chunkIndex: number): string {
  return generateCacheKey('analysis', novelId, chunkIndex.toString())
}

// レイアウトのキャッシュキー
export function getLayoutCacheKey(episodeId: string, pageNumber: number): string {
  return generateCacheKey('layout', episodeId, pageNumber.toString())
}

// キャッシュの設定を取得（ベストプラクティス: 最小60秒）
export function getCacheTTL(type: 'analysis' | 'layout'): number {
  const config = getConfig()
  const baseTTL = config.get<number>('processing.cache.ttl')

  // KVのベストプラクティス: 最小60秒のTTL
  const minTTL = 60

  // タイプ別の推奨TTL（パフォーマンス最適化）
  const recommendedTTL = {
    analysis: Math.max(3600, baseTTL), // 分析結果は1時間以上キャッシュ推奨
    layout: Math.max(1800, baseTTL), // レイアウトは30分以上キャッシュ推奨
  }

  return Math.max(minTTL, recommendedTTL[type] || baseTTL)
}

// キャッシュの有効性チェック
export async function isCacheEnabled(type: 'analysis' | 'layout'): Promise<boolean> {
  const config = getConfig()
  const features = config.get<{ enableCaching: boolean }>('features')
  const processingCache = config.get<{ analysisCache?: boolean; layoutCache?: boolean }>(
    'processing.cache',
  )

  // 全体的なキャッシュ機能が無効の場合
  if (!features.enableCaching) {
    return false
  }

  // 特定のタイプのキャッシュが無効の場合
  if (type === 'analysis' && !processingCache.analysisCache) {
    return false
  }

  if (type === 'layout' && !processingCache.layoutCache) {
    return false
  }

  return true
}

// キャッシュから取得（型安全・パフォーマンス最適化）
export async function getCachedData<T>(
  key: string,
  options?: { type?: 'json' | 'text' | 'arrayBuffer' | 'stream' },
): Promise<T | null> {
  const cache = getCache()
  try {
    // KVベストプラクティス: streamが最速、次にarrayBuffer、text、jsonの順
    const data = await cache.get(key, { type: options?.type || 'json' })
    return data as T
  } catch (error) {
    console.error(`Failed to get cached data for key ${key}:`, error)
    return null
  }
}

// キャッシュに保存（型安全・ベストプラクティス）
export async function setCachedData<T>(key: string, data: T, ttl?: number): Promise<void> {
  const cache = getCache()
  try {
    const options: KVPutOptions = {}

    // KVベストプラクティス: TTLは最小60秒
    if (ttl) {
      options.expirationTtl = Math.max(60, ttl)
    }

    // データサイズチェック（KVの制限: 25MB）
    const serialized = JSON.stringify(data)
    const sizeInMB = new Blob([serialized]).size / (1024 * 1024)
    if (sizeInMB > 25) {
      console.error(`Data size (${sizeInMB.toFixed(2)}MB) exceeds KV limit of 25MB for key: ${key}`)
      return
    }

    await cache.put(key, serialized, options)
  } catch (error) {
    console.error(`Failed to set cached data for key ${key}:`, error)
  }
}

// キャッシュから削除
export async function deleteCachedData(key: string): Promise<void> {
  const cache = getCache()
  try {
    await cache.delete(key)
  } catch (error) {
    console.error(`Failed to delete cached data for key ${key}:`, error)
  }
}

// 複数のキャッシュキーを一括削除（プレフィックス指定）
export async function deleteCachedDataByPrefix(prefix: string): Promise<void> {
  const cache = getCache()
  try {
    const result = await cache.list({ prefix })
    for (const key of result.keys) {
      await cache.delete(key.name)
    }
  } catch (error) {
    console.error(`Failed to delete cached data with prefix ${prefix}:`, error)
  }
}
