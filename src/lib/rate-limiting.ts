/**
 * Rate Limiting Utilities
 * Provides in-memory rate limiting for API endpoints
 */

import type { NextRequest } from 'next/server'
import { ApiError } from '@/server/auth/effectToApiResponse'
import { logSecurityViolation } from './api-validation'

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  requests: number
  windowMs: number
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number
  resetTime: number
}

/**
 * In-memory rate limit store
 * In production, this should be replaced with Redis or similar
 */
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000,
    )
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key)
    if (entry && Date.now() > entry.resetTime) {
      this.store.delete(key)
      return undefined
    }
    return entry
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry)
  }

  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now()
    const existing = this.get(key)

    if (existing) {
      existing.count++
      return existing
    } else {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      }
      this.set(key, newEntry)
      return newEntry
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.store.clear()
  }
}

// Global rate limit store
const rateLimitStore = new RateLimitStore()

/**
 * Get client identifier for rate limiting
 */
function getClientId(request: NextRequest): string {
  // Try to get IP address from various headers
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  // In production, you might want to include user ID for authenticated requests
  // const userId = await getUserIdFromRequest(request)
  // return userId ? `user:${userId}` : `ip:${ip}`

  return `ip:${ip}`
}

/**
 * Apply rate limiting to a request
 */
export function applyRateLimit(
  request: NextRequest,
  config: RateLimitConfig | undefined,
  identifier?: string,
): void {
  // No-op when config is not provided
  if (!config) return
  const clientId = identifier || getClientId(request)
  const key = `${request.url}:${clientId}`

  const entry = rateLimitStore.increment(key, config.windowMs)

  if (entry.count > config.requests) {
    const resetTime = new Date(entry.resetTime).toISOString()

    logSecurityViolation('RATE_LIMIT_EXCEEDED', request, {
      clientId,
      requests: entry.count,
      limit: config.requests,
      resetTime,
    })

    throw new ApiError(
      'RATE_LIMIT_EXCEEDED',
      `レート制限に達しました。${new Date(entry.resetTime).toLocaleString('ja-JP')} 以降に再試行してください`,
      429,
      {
        limit: config.requests,
        remaining: 0,
        resetTime,
      },
    )
  }
}

/**
 * Get rate limit status for a request
 */
export function getRateLimitStatus(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string,
): {
  limit: number
  remaining: number
  resetTime: string
} {
  const clientId = identifier || getClientId(request)
  const key = `${request.url}:${clientId}`

  const entry = rateLimitStore.get(key)

  if (!entry) {
    return {
      limit: config.requests,
      remaining: config.requests,
      resetTime: new Date(Date.now() + config.windowMs).toISOString(),
    }
  }

  return {
    limit: config.requests,
    remaining: Math.max(0, config.requests - entry.count),
    resetTime: new Date(entry.resetTime).toISOString(),
  }
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(config: RateLimitConfig) {
  return (request: NextRequest): void => {
    applyRateLimit(request, config)
  }
}

/**
 * Predefined rate limiters
 */
export const rateLimiters = {
  default: withRateLimit({ requests: 100, windowMs: 15 * 60 * 1000 }), // 100 requests per 15 minutes
  auth: withRateLimit({ requests: 10, windowMs: 15 * 60 * 1000 }), // 10 auth requests per 15 minutes
  upload: withRateLimit({ requests: 20, windowMs: 60 * 60 * 1000 }), // 20 uploads per hour
  strict: withRateLimit({ requests: 30, windowMs: 15 * 60 * 1000 }), // 30 requests per 15 minutes
}

/**
 * Clean up rate limit store (for testing)
 */
export function cleanupRateLimitStore(): void {
  rateLimitStore.destroy()
}
