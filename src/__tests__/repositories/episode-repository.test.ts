import { describe, expect, it, vi } from 'vitest'
import type { Episode, NewEpisode } from '@/db'
import { type EpisodeDbPort, EpisodeRepository } from '@/repositories/episode-repository'

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
          confidence: 0.5 as unknown as number,
        } as Omit<NewEpisode, 'id' | 'createdAt'>,
      ]),
    ).rejects.toThrow('db error')
  })

  describe('getEpisodeNumbersByChunk', () => {
    it('returns episode numbers containing the specified chunk', async () => {
      const mockEpisodes: Episode[] = [
        {
          id: 'e1',
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: null,
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 2,
          endCharIndex: 100,
          confidence: 0.9,
          episodeTextPath: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'e2',
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 2,
          title: 'Episode 2',
          summary: null,
          startChunk: 2,
          startCharIndex: 50,
          endChunk: 4,
          endCharIndex: 200,
          confidence: 0.8,
          episodeTextPath: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]

      const getEpisodesByJobId = vi.fn().mockResolvedValue(mockEpisodes)
      const repo = new EpisodeRepository(makePort({ getEpisodesByJobId }))

      // Chunk 2 should be in both episodes
      const result = await repo.getEpisodeNumbersByChunk('j1', 2)
      expect(result).toEqual([1, 2])
    })

    it('returns empty array when chunk is not in any episode', async () => {
      const mockEpisodes: Episode[] = [
        {
          id: 'e1',
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: null,
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 2,
          endCharIndex: 100,
          confidence: 0.9,
          episodeTextPath: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]

      const getEpisodesByJobId = vi.fn().mockResolvedValue(mockEpisodes)
      const repo = new EpisodeRepository(makePort({ getEpisodesByJobId }))

      // Chunk 5 is not in any episode
      const result = await repo.getEpisodeNumbersByChunk('j1', 5)
      expect(result).toEqual([])
    })

    it('returns sorted episode numbers', async () => {
      const mockEpisodes: Episode[] = [
        {
          id: 'e3',
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 3,
          title: 'Episode 3',
          summary: null,
          startChunk: 1,
          startCharIndex: 0,
          endChunk: 3,
          endCharIndex: 100,
          confidence: 0.9,
          episodeTextPath: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'e1',
          novelId: 'n1',
          jobId: 'j1',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: null,
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 2,
          endCharIndex: 100,
          confidence: 0.9,
          episodeTextPath: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]

      const getEpisodesByJobId = vi.fn().mockResolvedValue(mockEpisodes)
      const repo = new EpisodeRepository(makePort({ getEpisodesByJobId }))

      // Chunk 1 should be in episodes 3 and 1, but returned sorted
      const result = await repo.getEpisodeNumbersByChunk('j1', 1)
      expect(result).toEqual([1, 3])
    })
  })
})
