import { beforeEach, describe, expect, it } from 'vitest'
import { loadEpisodePreview } from '@/services/application/episode-preview'
import { clearStorageCache, getLayoutStorage, getRenderStorage } from '@/utils/storage'
import { StorageKeys } from '@/utils/storage-keys'

describe('loadEpisodePreview', () => {
  beforeEach(async () => {
    clearStorageCache()
  })

  it('レイアウトJSONからページを取得し、レンダー画像を読み込む', async () => {
    const jobId = 'job_test'
    const episode = 1
    const layout = {
      pages: [{ page_number: 2 }, { page_number: 1 }],
    }

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
