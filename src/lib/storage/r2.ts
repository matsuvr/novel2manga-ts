import { getConfig } from '@/config/config-loader'
import fs from 'fs/promises'
import path from 'path'

// R2のバインディング型定義
interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob, options?: R2PutOptions): Promise<R2Object | null>
  get(key: string): Promise<R2Object | null>
  delete(key: string): Promise<void>
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string
    contentEncoding?: string
  }
  customMetadata?: Record<string, string>
}

interface R2Object {
  key: string
  size: number
  etag: string
  httpEtag: string
  uploaded: Date
  httpMetadata: Record<string, string>
  customMetadata: Record<string, string>
  body: ReadableStream
  bodyUsed: boolean
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  json(): Promise<any>
}

// 環境に応じたストレージを取得
export async function getStorageBucket(bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE'): Promise<R2Bucket | null> {
  if (process.env.NODE_ENV === 'development') {
    return null // 開発環境ではローカルファイルシステムを使用
  }
  
  // 本番環境：R2を使用
  // @ts-expect-error - R2バインディングはランタイムで利用可能
  if (globalThis[bucketName]) {
    // @ts-expect-error - R2バインディングはランタイムで利用可能
    return globalThis[bucketName] as R2Bucket
  }
  
  return null
}

// 開発環境用のローカルストレージパス
function getLocalStoragePath(key: string): string {
  const config = getConfig()
  const basePath = config.getPath<string>('storage.local.basePath')
  return path.join(process.cwd(), basePath, key)
}

// マルチパートアップロードのサイズ閾値（R2ベストプラクティス）
const MULTIPART_THRESHOLD = 100 * 1024 * 1024 // 100MB

// R2のパフォーマンス最適化設定
export interface R2UploadOptions {
  contentType?: string
  cacheControl?: string
  metadata?: Record<string, string>
}

// キャッシュ最適化: Cloudflare CDNとの統合
export function getCacheHeaders(dataType: 'analysis' | 'novel' | 'manga'): Record<string, string> {
  switch (dataType) {
    case 'analysis':
      // 分析結果は長期間キャッシュ可能
      return {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800', // 1日、CDNは7日
        'CDN-Cache-Control': 'max-age=604800' // Cloudflare CDN専用
      }
    case 'novel':
      // 元データは変更されないため永続的にキャッシュ
      return {
        'Cache-Control': 'public, max-age=31536000, immutable', // 1年
      }
    case 'manga':
      // マンガデータは更新される可能性があるため短めに
      return {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400', // 1時間、CDNは1日
      }
    default:
      return {
        'Cache-Control': 'public, max-age=3600', // デフォルト1時間
      }
  }
}

// ストレージクラスの選択ガイド（R2ベストプラクティス）
export function determineStorageClass(
  accessFrequency: 'frequent' | 'infrequent',
  dataType: 'analysis' | 'novel' | 'manga'
): 'standard' | 'infrequent' {
  // 分析結果は頻繁にアクセスされるためStandard
  if (dataType === 'analysis') {
    return 'standard'
  }
  
  // 小説の元データは初回処理後はあまりアクセスされない
  if (dataType === 'novel' && accessFrequency === 'infrequent') {
    return 'infrequent' // 30日以上保存される場合
  }
  
  // マンガデータは頻繁にアクセスされる
  if (dataType === 'manga') {
    return 'standard'
  }
  
  return 'standard' // デフォルト
}

// エラーハンドリング: R2特有のエラーへの対処
export async function retryableR2Operation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
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
          const backoffMs = Math.pow(2, i) * 1000
          await new Promise(resolve => setTimeout(resolve, backoffMs))
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

// JSONデータを保存（ベストプラクティス適用）
export async function saveJson(
  key: string, 
  data: any, 
  bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE',
  options?: R2UploadOptions
): Promise<void> {
  const jsonString = JSON.stringify(data, null, 2)
  
  const bucket = await getStorageBucket(bucketName)
  if (bucket) {
    // データタイプを判定してキャッシュヘッダーを設定
    const dataType = bucketName === 'NOVEL_STORAGE' ? 'novel' :
                    bucketName === 'ANALYSIS_STORAGE' ? 'analysis' : 'manga'
    const cacheHeaders = getCacheHeaders(dataType)
    
    // R2に保存（リトライロジック付き）
    await retryableR2Operation(async () => {
      await bucket.put(key, jsonString, {
        httpMetadata: {
          contentType: options?.contentType || 'application/json',
          ...cacheHeaders,
          ...(options?.cacheControl ? { 'Cache-Control': options.cacheControl } : {})
        },
        customMetadata: options?.metadata || {}
      })
    })
  } else {
    // ローカルファイルシステムに保存
    const filePath = getLocalStoragePath(key)
    const dir = path.dirname(filePath)
    
    // ディレクトリが存在しない場合は作成
    try {
      await fs.access(dir)
    } catch {
      await fs.mkdir(dir, { recursive: true })
    }
    
    await fs.writeFile(filePath, jsonString, 'utf-8')
  }
}

// JSONデータを読み込み（リトライロジック付き）
export async function loadJson(key: string, bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE'): Promise<any | null> {
  const bucket = await getStorageBucket(bucketName)
  if (bucket) {
    // R2から読み込み（リトライロジック付き）
    return await retryableR2Operation(async () => {
      const object = await bucket.get(key)
      if (!object) {
        return null
      }
      return await object.json()
    })
  } else {
    // ローカルファイルシステムから読み込み
    const filePath = getLocalStoragePath(key)
    try {
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      return null
    }
  }
}

// ファイルを削除（リトライロジック付き）
export async function deleteFile(key: string, bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE'): Promise<void> {
  const bucket = await getStorageBucket(bucketName)
  if (bucket) {
    // R2から削除（リトライロジック付き）
    await retryableR2Operation(async () => {
      await bucket.delete(key)
    })
  } else {
    // ローカルファイルシステムから削除
    const filePath = getLocalStoragePath(key)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  }
}

// R2のコスト最適化: 不要なClass A操作の削減
export async function bulkDelete(
  keys: string[],
  bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE'
): Promise<void> {
  const bucket = await getStorageBucket(bucketName)
  
  if (!bucket) {
    // 開発環境での一括削除
    for (const key of keys) {
      await deleteFile(key, bucketName)
    }
    return
  }
  
  // R2では一括削除APIがないため、個別に削除（リトライロジック付き）
  await Promise.all(keys.map(key => 
    retryableR2Operation(async () => bucket.delete(key))
  ))
}

// 大容量ファイルのアップロード（将来的なマルチパート対応）
export async function uploadLargeFile(
  key: string,
  data: ArrayBuffer | Blob,
  bucketName: 'NOVEL_STORAGE' | 'CHUNKS_STORAGE' | 'ANALYSIS_STORAGE',
  options?: R2UploadOptions
): Promise<void> {
  const bucket = await getStorageBucket(bucketName)
  
  if (!bucket) {
    // 開発環境: ローカルファイルシステムにフォールバック
    throw new Error('Large file upload not supported in development')
  }
  
  // データタイプを判定してキャッシュヘッダーを設定
  const dataType = bucketName === 'NOVEL_STORAGE' ? 'novel' :
                  bucketName === 'ANALYSIS_STORAGE' ? 'analysis' : 'manga'
  const cacheHeaders = getCacheHeaders(dataType)
  
  // R2のベストプラクティス: メタデータとキャッシュ制御の設定
  const putOptions: any = {
    httpMetadata: {
      contentType: options?.contentType || 'application/octet-stream',
      ...cacheHeaders,
      ...(options?.cacheControl ? { 'Cache-Control': options.cacheControl } : {})
    },
    customMetadata: options?.metadata || {}
  }
  
  // 将来的にはマルチパートアップロードを実装
  if (data instanceof Blob && data.size > MULTIPART_THRESHOLD) {
    console.warn('Large file detected. Consider implementing multipart upload.')
  }
  
  await retryableR2Operation(async () => {
    await bucket.put(key, data, putOptions)
  })
}

// チャンク分析結果の保存パスを生成
export function getChunkAnalysisPath(novelId: string, chunkIndex: number): string {
  return `analysis/${novelId}/chunk_${chunkIndex}.json`
}

// 統合分析結果の保存パスを生成
export function getIntegratedAnalysisPath(novelId: string): string {
  return `analysis/${novelId}/integrated.json`
}

// 小説テキストの保存パスを生成
export function getNovelTextPath(novelId: string): string {
  return `novels/${novelId}.json`
}

// チャンクテキストの保存パスを生成
export function getChunkTextPath(chunkId: string): string {
  return `chunks/${chunkId}.json`
}