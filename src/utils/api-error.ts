import { NextResponse } from 'next/server'

// ========================================
// Error Classes (設計書対応)
// ========================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// リトライ可能エラー
export class RetryableError extends ApiError {
  constructor(
    message: string,
    statusCode: number = 503,
    public retryAfter?: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, statusCode, code, details)
    this.name = 'RetryableError'
  }
}

// バリデーションエラー
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

// リソース未発見エラー
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} (ID: ${id}) が見つかりません` : `${resource}が見つかりません`
    super(message, 404, 'NOT_FOUND', { resource, id })
    this.name = 'NotFoundError'
  }
}

// 権限エラー
export class ForbiddenError extends ApiError {
  constructor(message: string = 'アクセス権限がありません', action?: string) {
    super(message, 403, 'FORBIDDEN', { action })
    this.name = 'ForbiddenError'
  }
}

// 認証エラー
export class AuthenticationError extends ApiError {
  constructor(message: string = '認証が必要です') {
    super(message, 401, 'AUTH_REQUIRED')
    this.name = 'AuthenticationError'
  }
}

// レート制限エラー
export class RateLimitError extends RetryableError {
  constructor(retryAfter: number = 60) {
    super('レート制限に達しました', 429, retryAfter, 'RATE_LIMIT')
    this.name = 'RateLimitError'
  }
}

// 外部API エラー
export class ExternalApiError extends ApiError {
  constructor(service: string, message: string, statusCode: number = 502, originalError?: unknown) {
    super(`${service} API エラー: ${message}`, statusCode, 'EXTERNAL_API_ERROR', {
      service,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    })
    this.name = 'ExternalApiError'
  }
}

// データベースエラー
export class DatabaseError extends ApiError {
  constructor(operation: string, message: string, originalError?: unknown) {
    super(`データベース ${operation} エラー: ${message}`, 500, 'DATABASE_ERROR', {
      operation,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    })
    this.name = 'DatabaseError'
  }
}

// ストレージエラー
export class StorageError extends ApiError {
  constructor(operation: string, message: string, originalError?: unknown) {
    super(`ストレージ ${operation} エラー: ${message}`, 500, 'STORAGE_ERROR', {
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
): NextResponse {
  console.error('API Error:', error)

  // ApiError系のエラー
  if (error instanceof ApiError) {
    const response = {
      success: false as const,
      error: error.message,
      code: error.code,
      details: error.details,
    }

    // RetryableErrorの場合はRetry-Afterヘッダーを追加
    if (error instanceof RetryableError && error.retryAfter) {
      return NextResponse.json(response, {
        status: error.statusCode,
        headers: {
          'Retry-After': error.retryAfter.toString(),
        },
      })
    }

    return NextResponse.json(response, { status: error.statusCode })
  }

  // Node.js システムエラー
  if (error instanceof Error) {
    // ファイルが見つからないエラー
    if ('code' in error && error.code === 'ENOENT') {
      return NextResponse.json(
        {
          success: false as const,
          error: 'リソースが見つかりません',
          code: 'NOT_FOUND',
        },
        { status: 404 },
      )
    }

    // ファイル権限エラー
    if ('code' in error && error.code === 'EACCES') {
      return NextResponse.json(
        {
          success: false as const,
          error: 'ファイルアクセス権限がありません',
          code: 'FILE_ACCESS_DENIED',
        },
        { status: 403 },
      )
    }

    // ディスク容量不足エラー
    if ('code' in error && error.code === 'ENOSPC') {
      return NextResponse.json(
        {
          success: false as const,
          error: 'ディスク容量が不足しています',
          code: 'INSUFFICIENT_STORAGE',
        },
        { status: 507 },
      )
    }

    // タイムアウトエラー
    if ('code' in error && error.code === 'ETIMEDOUT') {
      return NextResponse.json(
        {
          success: false as const,
          error: 'リクエストがタイムアウトしました',
          code: 'TIMEOUT',
        },
        { status: 408 },
      )
    }

    // その他のエラー
    return NextResponse.json(
      {
        success: false as const,
        error: error.message || defaultMessage,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    )
  }

  // 予期しないエラー
  return NextResponse.json(
    {
      success: false as const,
      error: defaultMessage,
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 },
  )
}

// ========================================
// Legacy Functions (後方互換性)
// ========================================

export function handleApiError(error: unknown): NextResponse {
  return createErrorResponse(error)
}

export function validationError(message: string, details?: Record<string, unknown>): NextResponse {
  return createErrorResponse(new ValidationError(message, undefined, details))
}

export function authError(message: string = '認証が必要です'): NextResponse {
  return createErrorResponse(new AuthenticationError(message))
}

export function forbiddenError(message: string = 'アクセス権限がありません'): NextResponse {
  return createErrorResponse(new ForbiddenError(message))
}

export function notFoundError(resource: string): NextResponse {
  return createErrorResponse(new NotFoundError(resource))
}

export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
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
      if (!(error instanceof RetryableError)) {
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
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${level.toUpperCase()}] ${message}`, logEntry)
  } else {
    // 本番環境では構造化ログを出力
    console.log(JSON.stringify(logEntry))
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
    console.error('Error Report:', {
      error,
      context,
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}
