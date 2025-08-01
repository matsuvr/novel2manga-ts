import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, JobProgress, JobStatus } from '@/types'
import { DatabaseService } from '../services/database'
import type { DatabaseAdapter } from '../utils/storage'
import { StorageFactory } from '../utils/storage'

// モック設定
vi.mock('@/config', () => ({
  isDevelopment: vi.fn(),
}))

vi.mock('../utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

describe('DatabaseService', () => {
  let mockDb: DatabaseAdapter
  let service: DatabaseService

  beforeEach(() => {
    vi.clearAllMocks()

    // DatabaseAdapterのモック
    mockDb = {
      prepare: vi.fn(),
      run: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
      batch: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(StorageFactory.getDatabase).mockResolvedValue(mockDb)
    service = new DatabaseService(mockDb)
  })

  describe('createJob', () => {
    it('should create a new job', async () => {
      await service.createJob('job-123', 'test text', 10)

      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT INTO jobs (id, original_text, chunk_count, status) VALUES (?, ?, ?, ?)',
        ['job-123', 'test text', 10, 'pending'],
      )
    })
  })

  describe('createChunk', () => {
    it('should create a new chunk', async () => {
      const chunk = {
        id: 'chunk-123',
        jobId: 'job-123',
        chunkIndex: 0,
        content: 'chunk content',
        fileName: 'chunk-0.txt',
      }

      await service.createChunk(chunk)

      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT INTO chunks (id, job_id, chunk_index, content, file_name) VALUES (?, ?, ?, ?, ?)',
        ['chunk-123', 'job-123', 0, 'chunk content', 'chunk-0.txt'],
      )
    })
  })

  describe('getJob', () => {
    it('should get a job by id', async () => {
      const mockJob = {
        id: 'job-123',
        originalText: 'test text',
        chunkCount: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockDb.get).mockResolvedValue(mockJob)

      const result = await service.getJob('job-123')

      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT id, original_text as originalText, chunk_count as chunkCount, created_at as createdAt, updated_at as updatedAt FROM jobs WHERE id = ?',
        ['job-123'],
      )
      expect(result).toEqual(mockJob)
    })

    it('should return null for non-existent job', async () => {
      vi.mocked(mockDb.get).mockResolvedValue(null)

      const result = await service.getJob('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getChunksByJobId', () => {
    it('should get all chunks for a job', async () => {
      const mockChunks = [
        { id: 'chunk-1', jobId: 'job-123', chunkIndex: 0 },
        { id: 'chunk-2', jobId: 'job-123', chunkIndex: 1 },
      ]

      vi.mocked(mockDb.all).mockResolvedValue(mockChunks)

      const result = await service.getChunksByJobId('job-123')

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT id, job_id as jobId, chunk_index as chunkIndex, content, file_name as fileName, created_at as createdAt FROM chunks WHERE job_id = ? ORDER BY chunk_index',
        ['job-123'],
      )
      expect(result).toEqual(mockChunks)
    })

    it('should return empty array when no chunks exist', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([])

      const result = await service.getChunksByJobId('job-123')

      expect(result).toEqual([])
    })
  })

  describe('getExtendedJob', () => {
    it('should get extended job with parsed progress', async () => {
      const mockProgress: JobProgress = {
        currentStep: 'analyze',
        processedChunks: 5,
        totalChunks: 10,
        episodes: [],
      }

      const mockJob = {
        id: 'job-123',
        originalText: 'test text',
        chunkCount: 10,
        status: 'processing' as JobStatus,
        progress: JSON.stringify(mockProgress),
        errorMessage: null,
        processedChunks: 5,
        totalEpisodes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockDb.get).mockResolvedValue(mockJob)

      const result = await service.getExtendedJob('job-123')

      expect(result).toEqual({
        ...mockJob,
        progress: mockProgress,
      })
    })

    it('should handle job without progress', async () => {
      const mockJob = {
        id: 'job-123',
        originalText: 'test text',
        chunkCount: 10,
        status: 'pending' as JobStatus,
        progress: null,
        errorMessage: null,
        processedChunks: 0,
        totalEpisodes: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(mockDb.get).mockResolvedValue(mockJob)

      const result = await service.getExtendedJob('job-123')

      expect(result).toEqual(mockJob)
    })
  })

  describe('updateJobStatus', () => {
    it('should update job status without error message', async () => {
      await service.updateJobStatus('job-123', 'completed')

      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', 'job-123'],
      )
    })

    it('should update job status with error message', async () => {
      await service.updateJobStatus('job-123', 'failed', 'Something went wrong')

      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE jobs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['failed', 'Something went wrong', 'job-123'],
      )
    })
  })

  describe('updateJobProgress', () => {
    it('should update job progress', async () => {
      const progress: JobProgress = {
        currentStep: 'layout',
        processedChunks: 10,
        totalChunks: 10,
        episodes: [
          {
            episodeNumber: 1,
            startChunk: 0,
            endChunk: 4,
            confidence: 0.9,
          },
        ],
      }

      await service.updateJobProgress('job-123', progress)

      expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'), [
        JSON.stringify(progress),
        10,
        1,
        'job-123',
      ])
    })
  })

  describe('createEpisode', () => {
    it('should create a new episode', async () => {
      const episode: Episode = {
        id: 'ep-1',
        jobId: 'job-123',
        episodeNumber: 1,
        title: 'Episode 1',
        summary: 'First episode',
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 4,
        endCharIndex: 5000,
        estimatedPages: 20,
        confidence: 0.95,
        createdAt: new Date(),
      }

      await service.createEpisode(episode)

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO episodes'),
        expect.arrayContaining([
          'job-123-ep1',
          'job-123',
          1,
          'Episode 1',
          'First episode',
          0,
          0,
          4,
          5000,
          20,
          0.95,
        ]),
      )
    })
  })

  describe('createEpisodes', () => {
    it('should create multiple episodes in batch', async () => {
      const episodes: Episode[] = [
        {
          id: 'ep-1',
          jobId: 'job-123',
          episodeNumber: 1,
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 4,
          endCharIndex: 5000,
          estimatedPages: 20,
          confidence: 0.95,
          createdAt: new Date(),
        },
        {
          id: 'ep-2',
          jobId: 'job-123',
          episodeNumber: 2,
          startChunk: 5,
          startCharIndex: 0,
          endChunk: 9,
          endCharIndex: 5000,
          estimatedPages: 18,
          confidence: 0.92,
          createdAt: new Date(),
        },
      ]

      await service.createEpisodes(episodes)

      expect(mockDb.batch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            query: expect.stringContaining('INSERT INTO episodes'),
            params: expect.arrayContaining(['job-123-ep1', 'job-123', 1]),
          }),
          expect.objectContaining({
            query: expect.stringContaining('INSERT INTO episodes'),
            params: expect.arrayContaining(['job-123-ep2', 'job-123', 2]),
          }),
        ]),
      )
    })
  })

  describe('getEpisodesByJobId', () => {
    it('should get all episodes for a job', async () => {
      const mockEpisodes = [
        {
          id: 'job-123-ep1',
          jobId: 'job-123',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: 'First episode',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 4,
          endCharIndex: 5000,
          estimatedPages: 20,
          confidence: 0.95,
          createdAt: new Date(),
        },
      ]

      vi.mocked(mockDb.all).mockResolvedValue(mockEpisodes)

      const result = await service.getEpisodesByJobId('job-123')

      expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('FROM episodes'), ['job-123'])
      expect(result).toEqual(mockEpisodes)
    })
  })
})
