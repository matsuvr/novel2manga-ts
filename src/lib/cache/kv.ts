import { getAppConfig } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'

// ローカルキャッシュの型定義（KV互換インターフェースの最小実装）
interface LocalCachePutOptions {
  expiration?: number
  expirationTtl?: number
  metadata?: Record<string, string>
}

interface LocalCacheListResult {
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
    options?: LocalCachePutOptions,
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

  async list(options?: { prefix?: string; limit?: number }): Promise<LocalCacheListResult> {
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

// 常にローカルキャッシュを使用（Cloudflare KV 依存を排除）
export function getCache(): MemoryCache {
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
  const app = getAppConfig()
  const baseTTL = app.processing.cache.ttl
  const minTTL = app.processing.cache.minTtlSec
  const recommended = app.processing.cache.recommended
  const byType = type === 'analysis' ? recommended.analysisSec : recommended.layoutSec
  return Math.max(minTTL, Math.max(byType, baseTTL))
}

// キャッシュの有効性チェック
export async function isCacheEnabled(type: 'analysis' | 'layout'): Promise<boolean> {
  const app = getAppConfig()
  const features = app.features
  const processingCache = app.processing.cache

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
    const data = await cache.get(key, { type: options?.type || 'json' })

    // JSONデータの場合はパースする
    if (options?.type === 'json' && typeof data === 'string') {
      try {
        return JSON.parse(data) as T
      } catch (parseError) {
  getLogger().error('cache_parse_json_failed', { key, error: parseError })
        return null
      }
    }

    return data as T
  } catch (error) {
    getLogger().error('cache_get_failed', { key, error })
    throw error
  }
}

// キャッシュに保存（型安全・ベストプラクティス）
export async function setCachedData<T>(key: string, data: T, ttl?: number): Promise<void> {
  const cache = getCache()
  try {
    const options: LocalCachePutOptions = {}

    if (ttl) {
      options.expirationTtl = Math.max(getAppConfig().processing.cache.minTtlSec, ttl)
    }

    // データサイズチェック（設定で管理）
    const serialized = JSON.stringify(data)
    const sizeInMB = new Blob([serialized]).size / (1024 * 1024)
    const maxItemSizeMB = getAppConfig().processing.cache.maxItemSizeMB
    if (sizeInMB > maxItemSizeMB) {
      getLogger().error('cache_set_exceeds_limit', {
        key,
        sizeMB: Number(sizeInMB.toFixed(2)),
        limitMB: maxItemSizeMB,
      })
      return
    }

    await cache.put(key, serialized, options)
  } catch (error) {
    getLogger().error('cache_set_failed', { key, error })
    throw error
  }
}

// キャッシュから削除
export async function deleteCachedData(key: string): Promise<void> {
  const cache = getCache()
  try {
    await cache.delete(key)
  } catch (error) {
    getLogger().error('cache_delete_failed', { key, error })
    throw error
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
    getLogger().error('cache_delete_prefix_failed', { prefix, error })
    throw error
  }
}
