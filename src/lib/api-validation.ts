/**
 * API Input Validation and Security Utilities
 * Provides comprehensive validation and security measures for API endpoints
 */

import type { NextRequest } from 'next/server'
import { ApiError } from '@/server/auth/effectToApiResponse'

/**
 * Request size limits (in bytes)
 */
export const REQUEST_SIZE_LIMITS = {
  JSON_BODY: 10 * 1024 * 1024, // 10MB
  FORM_DATA: 50 * 1024 * 1024, // 50MB
  TEXT_FIELD: 1 * 1024 * 1024, // 1MB for text fields
} as const

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  DEFAULT: { requests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
  AUTH: { requests: 10, windowMs: 15 * 60 * 1000 }, // 10 auth requests per 15 minutes
  UPLOAD: { requests: 20, windowMs: 60 * 60 * 1000 }, // 20 uploads per hour
} as const

/**
 * Validation schema types
 */
export interface ValidationSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array'
    required?: boolean
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    pattern?: RegExp
    enum?: readonly string[]
  }
}

/**
 * Security violation types for logging
 */
export type SecurityViolationType =
  | 'OVERSIZED_REQUEST'
  | 'INVALID_JSON'
  | 'VALIDATION_FAILURE'
  | 'SUSPICIOUS_PATTERN'
  | 'RATE_LIMIT_EXCEEDED'

/**
 * Log security violations
 */
export function logSecurityViolation(
  type: SecurityViolationType,
  request: NextRequest,
  details?: Record<string, unknown>,
) {
  const violation = {
    type,
    timestamp: new Date().toISOString(),
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    url: request.url,
    method: request.method,
    details,
  }

  // Log to console (in production, this should go to a security monitoring system)
  console.warn('Security Violation:', JSON.stringify(violation, null, 2))

  // TODO: In production, send to security monitoring service
  // await sendToSecurityMonitoring(violation)
}

/**
 * Validate request body size
 */
export function validateRequestSize(
  request: NextRequest,
  maxSize: number = REQUEST_SIZE_LIMITS.JSON_BODY,
): void {
  const contentLength = request.headers.get('content-length')

  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > maxSize) {
      logSecurityViolation('OVERSIZED_REQUEST', request, {
        contentLength: size,
        maxAllowed: maxSize,
      })
      throw new ApiError(
        'PAYLOAD_TOO_LARGE',
        `リクエストサイズが制限を超えています (最大: ${Math.round(maxSize / 1024 / 1024)}MB)`,
        413,
      )
    }
  }
}

/**
 * Safely parse JSON with size validation
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  request: NextRequest,
  maxSize: number = REQUEST_SIZE_LIMITS.JSON_BODY,
): Promise<T> {
  validateRequestSize(request, maxSize)

  try {
    const body = await request.json()
    return body as T
  } catch (error) {
    logSecurityViolation('INVALID_JSON', request, {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new ApiError('INVALID_FORMAT', '無効なJSON形式です', 400)
  }
}

/**
 * Validate data against schema
 */
export function validateData(data: unknown, schema: ValidationSchema, request?: NextRequest): void {
  const errors: string[] = []

  for (const [field, rules] of Object.entries(schema)) {
    const dataRecord = data as Record<string, unknown>
    const value = dataRecord[field]

    // Required field check
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} は必須です`)
      continue
    }

    // Skip validation if field is not required and not present
    if (!rules.required && (value === undefined || value === null)) {
      continue
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (actualType !== rules.type) {
      errors.push(`${field} は ${rules.type} 型である必要があります`)
      continue
    }

    // String validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} は ${rules.minLength} 文字以上である必要があります`)
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} は ${rules.maxLength} 文字以下である必要があります`)
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} の形式が無効です`)
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} は次のいずれかである必要があります: ${rules.enum.join(', ')}`)
      }
    }

    // Number validations
    if (rules.type === 'number' && typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} は ${rules.min} 以上である必要があります`)
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} は ${rules.max} 以下である必要があります`)
      }
    }
  }

  if (errors.length > 0) {
    if (request) {
      logSecurityViolation('VALIDATION_FAILURE', request, {
        errors,
        data: JSON.stringify(data),
      })
    }
    throw new ApiError('VALIDATION_ERROR', `入力データが無効です: ${errors.join(', ')}`, 400, {
      errors,
    })
  }
}

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags completely
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
}

/**
 * Validate file path to prevent path traversal
 */
export function validateFilePath(path: string): void {
  if (path.includes('..') || path.includes('~') || path.startsWith('/')) {
    throw new ApiError('INVALID_PATH', '無効なファイルパスです', 400)
  }
}

/**
 * Common validation schemas
 */
export const VALIDATION_SCHEMAS = {
  USER_SETTINGS: {
    emailNotifications: { type: 'boolean' as const },
    theme: { type: 'string' as const, enum: ['light', 'dark'] as const },
    language: { type: 'string' as const, enum: ['ja', 'en', 'zh-TW'] as const },
  },

  JOB_QUERY: {
    limit: { type: 'number' as const, min: 1, max: 100 },
    offset: { type: 'number' as const, min: 0 },
    status: {
      type: 'string' as const,
      enum: ['pending', 'processing', 'completed', 'failed'] as const,
    },
  },

  ACCOUNT_DELETION: {
    confirm: { type: 'boolean' as const, required: true },
  },
} as const

/**
 * Middleware for API route validation
 */
export function withValidation<T>(schema: ValidationSchema, maxSize?: number) {
  return async (request: NextRequest): Promise<T> => {
    const body = await parseJsonBody<T>(request, maxSize)
    validateData(body, schema, request)
    return body
  }
}
