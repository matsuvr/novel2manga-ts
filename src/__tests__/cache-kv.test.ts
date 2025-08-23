import { describe, expect, it, vi } from 'vitest'
import { getCache } from '../lib/cache/kv'

describe('getCache', () => {
  const originalEnv = process.env.NODE_ENV
  const originalCache = (globalThis as any).CACHE

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    if (originalCache === undefined) {
      delete (globalThis as any).CACHE
    } else {
      ;(globalThis as any).CACHE = originalCache
    }
  })

  it('throws when CACHE binding is missing in production', () => {
    process.env.NODE_ENV = 'production'
    delete (globalThis as any).CACHE
    expect(() => getCache()).toThrow('CACHE binding is not configured')
  })

  it('returns memory cache in test environment', () => {
    process.env.NODE_ENV = 'test'
    delete (globalThis as any).CACHE
    const cache = getCache()
    expect(cache).toBeDefined()
  })
})

// Separate test for getCachedData to ensure errors are not swallowed
import * as kv from '../lib/cache/kv'

describe('getCachedData', () => {
  it('propagates errors from cache.get', async () => {
    const error = new Error('failure')

    // Save original NODE_ENV
    const originalEnv = process.env.NODE_ENV

    // Set to production to avoid memory cache
    process.env.NODE_ENV = 'production'

    // Mock global CACHE
    const mockCache = { get: vi.fn().mockRejectedValue(error) }
    ;(globalThis as any).CACHE = mockCache

    // getCachedDataがエラーをスローすることを期待
    await expect(kv.getCachedData('key')).rejects.toThrow('failure')

    // Restore
    process.env.NODE_ENV = originalEnv
    delete (globalThis as any).CACHE
  })
})
