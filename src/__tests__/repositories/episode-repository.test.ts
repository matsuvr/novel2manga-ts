import { describe, it, expect, vi } from 'vitest'
import { EpisodeRepository, type EpisodeDbPort } from '@/repositories/episode-repository'
import type { Episode, NewEpisode } from '@/db'

function makePort(overrides: Partial<EpisodeDbPort> = {}): EpisodeDbPort {
  return {
    async getEpisodesByJobId(_jobId: string): Promise<Episode[]> {
      return []
    },
    ...overrides,
  }
}

describe('EpisodeRepository', () => {
  it('getByJobId delegates to port', async () => {
    const getEpisodesByJobId = vi.fn().mockResolvedValue([{ id: 'e1' }] as unknown as Episode[])
    const repo = new EpisodeRepository(makePort({ getEpisodesByJobId }))
    const res = await repo.getByJobId('job-1')
    expect(getEpisodesByJobId).toHaveBeenCalledWith('job-1')
    expect(res).toEqual([{ id: 'e1' }])
  })

  it('bulkUpsert is no-op with warning when createEpisodes is missing', async () => {
    const port = makePort()
    const repo = new EpisodeRepository(port)
    // Should not throw
    await repo.bulkUpsert([
      {
        novelId: 'n1',
        jobId: 'j1',
        episodeNumber: 1,
        title: 't',
        summary: undefined,
        startChunk: 1,
        startCharIndex: 0,
        endChunk: 1,
        endCharIndex: 0,
        estimatedPages: 1,
        confidence: 0.5 as unknown as number,
      } as Omit<NewEpisode, 'id' | 'createdAt'>,
    ])
  })

  it('bulkUpsert calls createEpisodes when available', async () => {
    const createEpisodes = vi.fn().mockResolvedValue(undefined)
    const port = makePort({ createEpisodes })
    const repo = new EpisodeRepository(port)

    const payload: Array<Omit<NewEpisode, 'id' | 'createdAt'>> = [
      {
        novelId: 'n1',
        jobId: 'j1',
        episodeNumber: 1,
        title: 't',
        summary: undefined,
        startChunk: 1,
        startCharIndex: 0,
        endChunk: 1,
        endCharIndex: 0,
        estimatedPages: 1,
        confidence: 0.5 as unknown as number,
      },
    ]

    await repo.bulkUpsert(payload)
    expect(createEpisodes).toHaveBeenCalledWith(payload)
  })

  it('bulkUpsert rethrows on port error', async () => {
    const createEpisodes = vi.fn().mockRejectedValue(new Error('db error'))
    const port = makePort({ createEpisodes })
    const repo = new EpisodeRepository(port)

    await expect(
      repo.bulkUpsert([
        {
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 1,
          title: 't',
          summary: undefined,
          startChunk: 1,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 0,
          estimatedPages: 1,
          confidence: 0.5 as unknown as number,
        } as Omit<NewEpisode, 'id' | 'createdAt'>,
      ]),
    ).rejects.toThrow('db error')
  })
})
