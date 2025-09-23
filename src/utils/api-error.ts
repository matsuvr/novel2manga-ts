// Use Web standard Response for tests and runtime; avoid importing next/server at runtime
import { ZodError } from 'zod'
import { isRateLimitError } from '@/errors/rate-limit-error'
import { isRetryableError } from '@/errors/retryable-error'
import { getLogger } from '@/infrastructure/logging/logger'
// HttpError 系は段階的移行を完了したため依存を排除

// ========================================
// Error Code System (typed constants)
// ========================================
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // INVALID_INPUT: Zod 等構造化検証エラーのうち、フィールド粒度ではなく入力全体が不正なケースを今後段階的に移行させる予定
  // VALIDATION_ERROR との違い:
  //  - VALIDATION_ERROR: 単一フィールド/フォームレベルでの再入力が可能なケース
  //  - INVALID_INPUT: ドメイン制約違反や相互依存により入力全体の再構築が必要なケース
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  INVALID_STATE: 'INVALID_STATE',
  RATE_LIMIT: 'RATE_LIMIT',
  RETRYABLE_ERROR: 'RETRYABLE_ERROR',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  INSUFFICIENT_STORAGE: 'INSUFFICIENT_STORAGE',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NOVEL_LOCK_NOT_ACQUIRED: 'NOVEL_LOCK_NOT_ACQUIRED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ========================================
// Error Classes (設計書対応)
// ========================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: ErrorCode,
    // details は文字列 (レガシーテスト互換) も許容するため unknown
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// リトライ可能エラー
// RetryableError is defined in '@/errors/retryable-error'

// バリデーションエラー
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR, { ...details, field })
    this.name = 'ValidationError'
  }
}

// リソース未発見エラー
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} (ID: ${id}) が見つかりません` : `${resource}が見つかりません`
    super(message, 404, ERROR_CODES.NOT_FOUND, { resource, id })
    this.name = 'NotFoundError'
  }
}

// 権限エラー
export class ForbiddenError extends ApiError {
  constructor(message: string = 'アクセス権限がありません', action?: string) {
    super(message, 403, ERROR_CODES.FORBIDDEN, { action })
    this.name = 'ForbiddenError'
  }
}

// 認証エラー
export class AuthenticationError extends ApiError {
  _tag = 'AuthenticationError' as const

  constructor(message: string = '認証が必要です') {
    super(message, 401, ERROR_CODES.AUTH_REQUIRED)
    this.name = 'AuthenticationError'
  }
}

// レート制限エラー
// RateLimitError is defined in '@/errors/rate-limit-error'

// 外部API エラー
export class ExternalApiError extends ApiError {
  constructor(service: string, message: string, statusCode: number = 502, originalError?: unknown) {
    super(`${service} API エラー: ${message}`, statusCode, ERROR_CODES.EXTERNAL_API_ERROR, {
      service,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    })
    this.name = 'ExternalApiError'
  }
}

// データベースエラー
export class DatabaseError extends ApiError {
  constructor(operation: string, message: string, originalError?: unknown) {
    super(`データベース ${operation} エラー: ${message}`, 500, ERROR_CODES.DATABASE_ERROR, {
      operation,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    })
    this.name = 'DatabaseError'
  }
}

// ストレージエラー
export class StorageError extends ApiError {
  constructor(operation: string, message: string, originalError?: unknown) {
    super(`ストレージ ${operation} エラー: ${message}`, 500, ERROR_CODES.STORAGE_ERROR, {
      operation,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    })
    this.name = 'StorageError'
  }
}

// ========================================
// Error Response Generator (設計書対応)
// ========================================

export function createErrorResponse(
  error: unknown,
  defaultMessage: string = '内部サーバーエラーが発生しました',
): Response {
  logError('API Error', error)

  // RetryableError 系（RateLimit を含む）
  if (isRetryableError(error)) {
    const isRateLimit = isRateLimitError(error)
    const response = {
      success: false as const,
      error: error.message,
      code: isRateLimit ? ERROR_CODES.RATE_LIMIT : ERROR_CODES.RETRYABLE_ERROR,
    }

    const status = isRateLimit ? 429 : 503
    const headers = error.retryAfter ? { 'Retry-After': error.retryAfter.toString() } : undefined

    return json(response, { status, headers })
  }

  // Zod バリデーションエラー
  if (error instanceof ZodError) {
    return json(
      {
        success: false as const,
        error: 'Invalid request data',
        code: ERROR_CODES.VALIDATION_ERROR,
        details: error.errors,
      },
      { status: 400 },
    )
  }

  // ApiError系のエラー
  if (error instanceof ApiError) {
    const response = {
      success: false as const,
      error: error.message,
      code: error.code,
      details: error.details,
    }

    // ApiError はこの段階ではリトライ系ではない（リトライ系は上で処理済み）

    return json(response, { status: error.statusCode })
  }

  // 既存の HttpError 互換は削除（使用箇所なしのため）

  // Node.js システムエラー
  if (error instanceof Error) {
    // ファイルが見つからないエラー
    if ('code' in error && error.code === 'ENOENT') {
      return json(
        {
          success: false as const,
          error: 'リソースが見つかりません',
          code: ERROR_CODES.NOT_FOUND,
        },
        { status: 404 },
      )
    }

    // ファイル権限エラー
    if ('code' in error && error.code === 'EACCES') {
      return json(
        {
          success: false as const,
          error: 'ファイルアクセス権限がありません',
          code: ERROR_CODES.FILE_ACCESS_DENIED,
        },
        { status: 403 },
      )
    }

    // ディスク容量不足エラー
    if ('code' in error && error.code === 'ENOSPC') {
      return json(
        {
          success: false as const,
          error: 'ディスク容量が不足しています',
          code: ERROR_CODES.INSUFFICIENT_STORAGE,
        },
        { status: 507 },
      )
    }

    // タイムアウトエラー
    if ('code' in error && error.code === 'ETIMEDOUT') {
      return json(
        {
          success: false as const,
          error: 'リクエストがタイムアウトしました',
          code: ERROR_CODES.TIMEOUT,
        },
        { status: 408 },
      )
    }

    // その他のエラー
    return json(
      {
        success: false as const,
        error: error.message && error.message.trim() !== '' ? error.message : defaultMessage,
        code: ERROR_CODES.INTERNAL_ERROR,
        details: error.message,
      },
      { status: 500 },
    )
  }

  // 予期しないエラー
  return json(
    {
      success: false as const,
      error: defaultMessage,
      code: ERROR_CODES.UNKNOWN_ERROR,
    },
    { status: 500 },
  )
}

// ========================================
// Generic Error Message Extractor (共有ユーティリティ)
// - さまざまな unknown エラー型から人間可読なメッセージ文字列を抽出
// - 既存のルート / ハンドラで重複していた inline closure を置き換える目的
// ========================================
/**
 * Extracts a human-readable error message from unknown error types.
 * Handles Error instances, strings, objects (with safe JSON stringify), and
 * edge cases like circular references, symbols, functions, null/undefined.
 * Order of precedence:
 * 1. Error -> error.message
 * 2. string -> value
 * 3. JSON.stringify(value) when it yields a string (objects / arrays / primitives)
 * 4. Fallback String(value) for circular, symbol, function, undefined, etc.
 * @param raw - The error object/value to extract message from
 * @returns A string representation of the error
 */
export function extractErrorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message
  if (typeof raw === 'string') return raw
  try {
    // JSON.stringify(undefined | symbol | function) => undefined なので ?? でフォールバック
    const json = JSON.stringify(raw)
    const base = json ?? String(raw)
    // 長大なオブジェクトでメッセージ肥大化を避ける（メモリ/ログ負荷対策）
    const MAX_ERROR_MESSAGE_LENGTH = 1000
    if (base.length > MAX_ERROR_MESSAGE_LENGTH) {
      return `${base.substring(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`
    }
    return base
  } catch {
    return String(raw)
  }
}

// ========================================
// Legacy Functions (後方互換性)
// ========================================

export function handleApiError(error: unknown): Response {
  return createErrorResponse(error)
}

export function validationError(message: string, details?: Record<string, unknown>): Response {
  return createErrorResponse(new ValidationError(message, undefined, details))
}

export function authError(message: string = '認証が必要です'): Response {
  return createErrorResponse(new AuthenticationError(message))
}

export function forbiddenError(message: string = 'アクセス権限がありません'): Response {
  return createErrorResponse(new ForbiddenError(message))
}

export function notFoundError(resource: string): Response {
  return createErrorResponse(new NotFoundError(resource))
}

export function createSuccessResponse<T extends Record<string, unknown> | unknown>(
  data: T,
  status: number = 200,
): Response {
  // If payload already contains a top-level success flag, trust caller (idempotent wrap)
  if (typeof data === 'object' && data && 'success' in (data as Record<string, unknown>)) {
    return json(data, { status })
  }
  // For common API patterns expecting flattened fields (tests read data.job, not data.data.job)
  if (typeof data === 'object' && data && !Array.isArray(data)) {
    return json({ success: true, ...(data as Record<string, unknown>) }, { status })
  }
  // Primitive or array payloads go under data key
  return json({ success: true, data }, { status })
}

// Alias for backward compatibility (to be removed)
export function successResponse<T>(data: T, status: number = 200): Response {
  return createSuccessResponse(data, status)
}

// ========================================
// Legacy-compatible Error Response (for gradual migration)
// - Keeps body shape: { error, details? }
// - Preserves statuses expected by existing unit tests
// - Centralizes logic (retryable/rate-limit + validations + known http errors)
// ========================================

type Env = 'development' | 'test' | 'production'
const env = (process.env.NODE_ENV as Env) ?? 'development'

export function toLegacyErrorResponse(
  error: unknown,
  fallbackMessage: string = 'Internal Server Error',
): Response {
  // Retryable errors (RateLimit included)
  if (isRetryableError(error)) {
    const status = isRateLimitError(error) ? 429 : 503
    const headers = error.retryAfter ? { 'Retry-After': error.retryAfter.toString() } : undefined
    return json({ error: error.message }, { status, headers })
  }

  // Zod validation
  if (error instanceof ZodError) {
    return json({ error: 'Invalid request data', details: error.errors }, { status: 400 })
  }

  // New ApiError hierarchy
  if (error instanceof ApiError) {
    const body: Record<string, unknown> = { error: error.message }
    if (env !== 'production') {
      body.details = error.details
      body.code = error.code
    }
    return json(body, { status: error.statusCode })
  }

  // Legacy HttpError: 互換レイヤは撤去済み（個別クラス分岐は行わない）

  // Node/system errors
  if (error instanceof Error) {
    if ('code' in error && error.code === 'ENOENT') {
      return json({ error: 'リソースが見つかりません' }, { status: 404 })
    }
    if ('code' in error && error.code === 'EACCES') {
      return json({ error: 'ファイルアクセス権限がありません' }, { status: 403 })
    }
    if ('code' in error && error.code === 'ENOSPC') {
      return json({ error: 'ディスク容量が不足しています' }, { status: 507 })
    }
    if ('code' in error && error.code === 'ETIMEDOUT') {
      return json({ error: 'リクエストがタイムアウトしました' }, { status: 408 })
    }

    const details = error.message
    if (env !== 'production') {
  getLogger().error('api_unhandled_error', { error })
      return json({ error: fallbackMessage, details }, { status: 500 })
    }
    return json({ error: fallbackMessage }, { status: 500 })
  }

  // Unknown type
  return json({ error: fallbackMessage }, { status: 500 })
}

// ========================================
// Retry Logic (設計書対応)
// ========================================

export interface RetryOptions {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffFactor: number
  retryCondition?: (error: unknown) => boolean
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown
  let delay = options.initialDelay

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // 最後の試行の場合は即座にエラーを投げる
      if (attempt === options.maxAttempts) {
        break
      }

      // リトライ条件をチェック
      if (options.retryCondition && !options.retryCondition(error)) {
        break
      }

      // RetryableErrorでない場合はリトライしない
      if (!isRetryableError(error)) {
        // ただし、特定のシステムエラーはリトライ対象
        if (error instanceof Error) {
          const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']
          if (!('code' in error && retryableCodes.includes(error.code as string))) {
            break
          }
        } else {
          break
        }
      }

      // 遅延実行
      await new Promise((resolve) => setTimeout(resolve, delay))

      // 次の遅延時間を計算（指数バックオフ）
      delay = Math.min(delay * options.backoffFactor, options.maxDelay)
    }
  }

  throw lastError
}

// ========================================
// Error Logging (設計書対応)
// ========================================

export interface ErrorLogEntry {
  timestamp: Date
  level: 'error' | 'warn' | 'info'
  message: string
  error?: unknown
  context?: Record<string, unknown>
  requestId?: string
  userId?: string
}

export function logError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
  level: 'error' | 'warn' | 'info' = 'error',
): void {
  const logEntry: ErrorLogEntry = {
    timestamp: new Date(),
    level,
    message,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
    context,
  }

  // 開発環境では詳細ログを出力
  const logger = getLogger()
  const payload: Record<string, unknown> = { ...logEntry }
  switch (level) {
    case 'warn':
      logger.warn(message, payload)
      break
    case 'info':
      logger.info(message, payload)
      break
    default:
      logger.error(message, payload)
  }
}

// ========================================
// Error Monitoring Integration
// ========================================

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  // エラー監視サービス（Sentry等）への送信
  // TODO: 本番環境でのエラー監視サービス統合

  logError('Unhandled error reported', error, context)

  // 開発環境では詳細出力
  if (process.env.NODE_ENV === 'development') {
    getLogger().error('error_report_detail', {
      error,
      context,
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

// Minimal JSON response helper using the Web Response API
function json(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', ...(init?.headers ?? {}) })
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers })
}
