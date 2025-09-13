/**
 * Simple API Security Tests (moved)
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/server/auth/effectToApiResponse'
import { sanitizeString, validateFilePath, validateRequestSize } from '../../lib/api-validation'
import { cleanupRateLimitStore } from '../../lib/rate-limiting'

describe('API Security - Basic Tests', () => {
  beforeEach(() => {
    cleanupRateLimitStore()
  })

  afterEach(() => {
    cleanupRateLimitStore()
  })

  describe('Request Size Validation', () => {
    it('should pass for small requests', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-length': '100' },
      })

      expect(() => validateRequestSize(request, 1000)).not.toThrow()
    })
  })
})
