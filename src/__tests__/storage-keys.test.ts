import { describe, expect, it } from 'vitest'
import { StorageKeys } from '@/utils/storage-keys'

describe('StorageKeys', () => {
  it('episodeLayoutProgress builds path', () => {
    const key = StorageKeys.episodeLayoutProgress('job123', 2)
    expect(key).toBe('job123/episode_2.progress.json')
  })
})
