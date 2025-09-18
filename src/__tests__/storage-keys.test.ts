import { describe, expect, it } from 'vitest'
import { StorageKeys } from '@/utils/storage'

describe('StorageKeys', () => {
  it('episodeLayoutProgress builds path', () => {
    const key = StorageKeys.episodeLayoutProgress({
      novelId: 'novel123',
      jobId: 'job123',
      episodeNumber: 2,
    })
    expect(key).toBe('novel123/jobs/job123/layouts/episode_2.progress.json')
  })
})
