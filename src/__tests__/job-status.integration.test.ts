import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks for DB and storage
const mockEpisodes = [
  { episodeNumber: 1, estimatedPages: 30 },
  { episodeNumber: 2, estimatedPages: 40 },
] as Array<{ episodeNumber: number; estimatedPages: number }>

const baseJob = {
  id: 'job-abc',
  novelId: 'novel-1',
  status: 'processing',
  currentStep: 'layout',
  processedChunks: 10,
  totalChunks: 10,
  processedEpisodes: 1,
  totalEpisodes: 2,
  renderedPages: 0,
  totalPages: 70,
  splitCompleted: true,
  analyzeCompleted: true,
  episodeCompleted: false,
  layoutCompleted: false,
  renderCompleted: false,
  lastError: null,
  lastErrorStep: null,
  progress: {
    currentStep: 'layout',
    processedChunks: 10,
    totalChunks: 10,
    episodes: [],
  },
}

vi.mock('@/services/db-factory', () => {
  return {
    getDatabaseService: () => ({
      getEpisodesByJobId: vi.fn().mockResolvedValue(mockEpisodes),
      getRenderStatusByEpisode: vi
        .fn()
        .mockImplementation((_jobId: string, ep: number) =>
          Promise.resolve(Array.from({ length: ep === 1 ? 0 : 0 })),
        ),
    }),
  }
})

vi.mock('@/repositories/adapters', () => {
  return {
    adaptAll: () => ({
      job: {
        entity: 'job',
        mode: 'rw',
        getJobWithProgress: vi.fn().mockResolvedValue({ ...baseJob }),
        getJob: vi.fn(),
        getJobsByNovelId: vi.fn(),
        createJob: vi.fn(),
        updateJobStatus: vi.fn(),
        updateJobStep: vi.fn(),
        markJobStepCompleted: vi.fn(),
        updateJobProgress: vi.fn(),
        updateJobError: vi.fn(),
      },
    }),
  }
})

vi.mock('@/infrastructure/storage/ports', async () => {
  // Build a minimal shape matching getStoragePorts return
  const layout = {
    getEpisodeLayoutProgress: vi.fn().mockImplementation((_jobId: string, ep: number) => {
      if (ep === 1) {
        return Promise.resolve(JSON.stringify({ pages: Array.from({ length: 30 }).map((_, i) => ({ page_number: i + 1 })) }))
      }
      if (ep === 2) {
        return Promise.resolve(JSON.stringify({ pages: Array.from({ length: 3 }).map((_, i) => ({ page_number: i + 1 })) }))
      }
      return Promise.resolve(null)
    }),
    getEpisodeLayout: vi.fn().mockResolvedValue(null),
  }
  return {
    getStoragePorts: () => ({ layout } as unknown as import('@/infrastructure/storage/ports').StoragePorts),
  }
})

import { JobProgressService } from '@/services/application/job-progress'

describe('Job status enrichment (perEpisodePages)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds perEpisodePages with planned/rendered/total', async () => {
    const svc = new JobProgressService()
    const result = await svc.getJobWithProgress('job-abc')
    expect(result).toBeTruthy()
    const per = result!.progress?.perEpisodePages
    expect(per).toBeTruthy()
    const ep1 = per && (per as Record<string, { planned: number }>)[1 as any]
    const ep2 = per && (per as Record<string, { planned: number; total?: number }>)[2 as any]
    expect(ep1?.planned).toBe(30)
    expect(ep2?.planned).toBe(3)
    // totals from DB episodes
    expect(ep1?.total).toBe(30)
    expect(ep2?.total).toBe(40)
  })
})

