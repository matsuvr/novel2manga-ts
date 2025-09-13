import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEpisodePreview } from '@/services/application/episode-preview'

// Provide in-memory storage mocks to avoid external bindings
vi.mock('@/utils/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/storage')>()
  const makeStore = () => {
    const map = new Map<string, { text: string }>()
    return {
      get: vi.fn(async (key: string) => map.get(key)),
      put: vi.fn(async (key: string, value: Buffer | string) => {
        const text = typeof value === 'string' ? value : Buffer.from(value).toString('base64')
        map.set(key, { text })
      }),
      list: vi.fn(async (_prefix: string) => Array.from(map.keys())),
    }
  }
  const stores = {
    layout: makeStore(),
    render: makeStore(),
  }
  return {
    ...actual,
    clearStorageCache: () => {
      // reset stores between tests
      Object.assign(stores, { layout: makeStore(), render: makeStore() })
    },
    // Provide factory API used by episode-preview
    StorageFactory: {
      getLayoutStorage: vi.fn(async () => stores.layout),
      getRenderStorage: vi.fn(async () => stores.render),
    },
    // Keep helpers available for tests that import functions
    getLayoutStorage: vi.fn(async () => stores.layout),
    getRenderStorage: vi.fn(async () => stores.render),
  }
})

describe('loadEpisodePreview', () => {
  beforeEach(async () => {
    const { clearStorageCache } = await import('@/utils/storage')
    clearStorageCache()
  })

  it('レイアウトJSONからページを取得し、レンダー画像を読み込む', async () => {
    const jobId = 'job_test'
    const episode = 1
    const layout = {
      pages: [{ page_number: 2 }, { page_number: 1 }],
    }

    const { getLayoutStorage, getRenderStorage, StorageKeys } = await import('@/utils/storage')
    const layoutStorage = await getLayoutStorage()
    await layoutStorage.put(StorageKeys.episodeLayout(jobId, episode), JSON.stringify(layout))

    const renderStorage = await getRenderStorage()
    await renderStorage.put(StorageKeys.pageRender(jobId, episode, 1), Buffer.from('image-1'))
    await renderStorage.put(StorageKeys.pageRender(jobId, episode, 2), Buffer.from('image-2'))

    const preview = await loadEpisodePreview(jobId, episode)
    expect(preview.episodeNumber).toBe(1)
    expect(preview.totalPages).toBe(2)
    expect(preview.images.map((i) => i.page)).toEqual([1, 2])
    expect(preview.images[0].base64).toBe(Buffer.from('image-1').toString('base64'))
    expect(preview.images[1].base64).toBe(Buffer.from('image-2').toString('base64'))
  })

  it('進捗JSONのnormalized/issueCountを反映する', async () => {
    const jobId = 'job_test2'
    const episode = 2
    const layout = {
      pages: [{ page_number: 1 }, { page_number: 2 }],
    }
    const progress = {
      validation: {
        normalizedPages: [2],
        pagesWithIssueCounts: { 2: 3 },
      },
    }

    const { getLayoutStorage, getRenderStorage, StorageKeys } = await import('@/utils/storage')
    const layoutStorage = await getLayoutStorage()
    await layoutStorage.put(StorageKeys.episodeLayout(jobId, episode), JSON.stringify(layout))
    await layoutStorage.put(
      StorageKeys.episodeLayoutProgress(jobId, episode),
      JSON.stringify(progress),
    )

    const renderStorage = await getRenderStorage()
    await renderStorage.put(StorageKeys.pageRender(jobId, episode, 1), Buffer.from('i1'))
    await renderStorage.put(StorageKeys.pageRender(jobId, episode, 2), Buffer.from('i2'))

    const preview = await loadEpisodePreview(jobId, episode)
    const page2 = preview.images.find((p) => p.page === 2)
    expect(page2?.isNormalized).toBe(true)
    expect(page2?.issueCount).toBe(3)
  })
})
