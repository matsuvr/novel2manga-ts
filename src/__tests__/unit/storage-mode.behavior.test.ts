import { beforeEach, describe, expect, it, vi } from 'vitest'

// We reset modules and environment per test to probe isDevelopment/resolveStorage behavior safely.
const loadStorageModule = async () => {
  vi.resetModules()
  return import('@/utils/storage')
}

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev = { ...process.env }
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
  try {
    await fn()
  } finally {
    process.env = { ...prev }
    vi.resetModules()
  }
}

const getIsDevelopment = async () => {
  vi.resetModules()
  const { isDevelopment } = await import('@/config')
  return isDevelopment()
}

describe('storage resolve behavior', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('resolveStorage throws in production when STORAGE_MODE is not local and VITEST unset', async () => {
    await withEnv({ NODE_ENV: 'production', STORAGE_MODE: undefined, VITEST: undefined }, async () => {
      const storageModule = await loadStorageModule()
      await expect(storageModule.getNovelStorage()).rejects.toThrow('Novel storage not configured')
    })
  })

  it('resolveStorage still throws in production when STORAGE_MODE is non-local even if VITEST is set', async () => {
    await withEnv({ NODE_ENV: 'production', STORAGE_MODE: 'test', VITEST: '1' }, async () => {
      const storageModule = await loadStorageModule()
      await expect(storageModule.getNovelStorage()).rejects.toThrow('Novel storage not configured')
    })
  })

  it('isDevelopment returns false when NODE_ENV is production even if VITEST is set', async () => {
    await withEnv({ NODE_ENV: 'production', VITEST: '1' }, async () => {
      const isDev = await getIsDevelopment()
      expect(isDev).toBe(false)
    })
  })
})
