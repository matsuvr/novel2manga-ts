import { describe, expect, it } from 'vitest'
import { adaptAll } from '@/repositories/adapters'

const fakeDb = {
  getEpisodesByJobId: async () => [],
  createEpisodes: async () => {},
  getJob: async () => null,
  getJobWithProgress: async () => null,
  getJobsByNovelId: async () => [],
  createJob: async () => 'job-1',
  getNovel: async () => null,
  getAllNovels: async () => [],
  ensureNovel: async () => {},
  createOutput: async () => 'out-1',
} as any

describe('adaptAll', () => {
  it('各ポートの discriminant / mode が期待通り', () => {
    const ports = adaptAll(fakeDb)
    expect(ports.episode.entity).toBe('episode')
    expect(ports.episode.mode).toBe('rw')
    expect(ports.job.entity).toBe('job')
    expect(ports.job.mode).toBe('rw')
    expect(ports.novel.entity).toBe('novel')
    expect(ports.novel.mode).toBe('rw')
    expect(ports.output.entity).toBe('output')
    expect(ports.output.mode).toBe('rw')
  })
})
