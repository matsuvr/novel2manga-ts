import { beforeEach, describe, expect, test } from 'vitest'
import type {
  Episode,
  Job,
  NewEpisode,
  NewJob,
  NewNovel,
  NewOutput,
  Novel,
  Output,
} from '@/db/schema'
import {
  adaptAll,
  adaptEpisodePort,
  adaptJobPort,
  adaptNovelPort,
  adaptOutputPort,
} from '@/repositories/adapters'
import type { DatabaseService } from '@/services/database-service'

// Mock DatabaseService implementation for testing
class MockDatabaseService implements DatabaseService {
  private episodes: Episode[] = []
  private jobs: Job[] = []
  private novels: Novel[] = []
  private outputs: Output[] = []

  // Episode methods
  async createEpisodes(episodes: NewEpisode[]): Promise<void> {
    const createdEpisodes = episodes.map((ep, index) => ({
      ...ep,
      id: `episode-${this.episodes.length + index + 1}`,
      createdAt: new Date(),
    }))
    this.episodes.push(...createdEpisodes)
  }

  async getEpisode(id: string): Promise<Episode | null> {
    return this.episodes.find((ep) => ep.id === id) ?? null
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    return this.episodes.filter((ep) => ep.jobId === jobId)
  }

  // Job methods
  async createJob(job: NewJob): Promise<string> {
    const created: Job = {
      ...job,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.jobs.push(created)
    return created.id
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.find((job) => job.id === id) ?? null
  }

  async getJobsByNovelId(novelId: string): Promise<Job[]> {
    return this.jobs.filter((job) => job.novelId === novelId)
  }

  async updateJobStatus(id: string, status: Job['status']): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (job) {
      job.status = status
      job.updatedAt = new Date()
    }
  }

  // Novel methods
  async ensureNovel(
    id: string,
    data: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const existing = this.novels.find((n) => n.id === id)
    if (!existing) {
      const novel: Novel = {
        ...data,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      this.novels.push(novel)
    }
  }

  async getNovel(id: string): Promise<Novel | null> {
    return this.novels.find((n) => n.id === id) ?? null
  }

  async getAllNovels(): Promise<Novel[]> {
    return [...this.novels]
  }

  // Output methods
  async createOutput(output: Omit<NewOutput, 'createdAt'>): Promise<string> {
    const created: Output = {
      ...output,
      createdAt: new Date(),
    }
    this.outputs.push(created)
    return created.id
  }
}

describe('Repository Adapters', () => {
  let dbService: DatabaseService

  beforeEach(() => {
    dbService = new MockDatabaseService()
  })

  describe('adaptEpisodePort', () => {
    test('should create read-only episode port', () => {
      const port = adaptEpisodePort(dbService, false)

      expect(port.entity).toBe('episode')
      expect(port.mode).toBe('ro')
      expect(port.getEpisodesByJobId).toBeDefined()
      expect('createEpisodes' in port).toBe(false)
    })

    test('should create read-write episode port', () => {
      const port = adaptEpisodePort(dbService, true)

      expect(port.entity).toBe('episode')
      expect(port.mode).toBe('rw')
      expect(port.getEpisodesByJobId).toBeDefined()
      expect(port.createEpisodes).toBeDefined()
    })

    test('read-write port should handle episode operations', async () => {
      const port = adaptEpisodePort(dbService, true)

      // Create episodes
      await port.createEpisodes([
        {
          jobId: 'job-1',
          episodeNumber: 1,
          title: 'Test Episode',
          description: 'Test Description',
          startPosition: 0,
          endPosition: 100,
        },
      ])

      // Get episodes by job ID
      const episodes = await port.getEpisodesByJobId('job-1')
      expect(episodes).toHaveLength(1)
      expect(episodes[0].title).toBe('Test Episode')
    })
  })

  describe('adaptNovelPort', () => {
    test('should create read-only novel port', () => {
      const port = adaptNovelPort(dbService, false)

      expect(port.entity).toBe('novel')
      expect(port.mode).toBe('ro')
      expect(port.getNovel).toBeDefined()
      expect(port.getAllNovels).toBeDefined()
      expect('ensureNovel' in port).toBe(false)
    })

    test('should create read-write novel port', () => {
      const port = adaptNovelPort(dbService, true)

      expect(port.entity).toBe('novel')
      expect(port.mode).toBe('rw')
      expect(port.getNovel).toBeDefined()
      expect(port.getAllNovels).toBeDefined()
      expect(port.ensureNovel).toBeDefined()
    })

    test('read-write port should handle novel operations', async () => {
      const port = adaptNovelPort(dbService, true)

      // Ensure novel
      await port.ensureNovel('novel-1', {
        title: 'Test Novel',
        author: 'Test Author',
        originalTextPath: 'test.txt',
        textLength: 1000,
        language: 'ja',
        metadataPath: null,
      })

      // Get novel
      const novel = await port.getNovel('novel-1')
      expect(novel).toBeDefined()
      expect(novel?.title).toBe('Test Novel')
    })
  })

  describe('adaptJobPort', () => {
    test('should create job port (always read-write)', () => {
      const port = adaptJobPort(dbService)

      expect(port.entity).toBe('job')
      expect(port.mode).toBe('rw')
      expect(port.createJob).toBeDefined()
      expect(port.getJob).toBeDefined()
      expect(port.getJobsByNovelId).toBeDefined()
      expect(port.updateJobStatus).toBeDefined()
    })

    test('should handle job operations', async () => {
      const port = adaptJobPort(dbService)

      // Create job
      const jobId = await port.createJob({
        id: 'job-1',
        novelId: 'novel-1',
        title: 'Test Job',
        status: 'pending',
      })

      expect(jobId).toBe('job-1')

      // Get job
      const job = await port.getJob('job-1')
      expect(job).toBeDefined()
      expect(job?.title).toBe('Test Job')

      // Update status
      await port.updateJobStatus('job-1', 'completed')
      const updatedJob = await port.getJob('job-1')
      expect(updatedJob?.status).toBe('completed')
    })
  })

  describe('adaptOutputPort', () => {
    test('should create output port (always read-write)', () => {
      const port = adaptOutputPort(dbService)

      expect(port.entity).toBe('output')
      expect(port.mode).toBe('rw')
      expect(port.createOutput).toBeDefined()
    })

    test('should handle output operations', async () => {
      const port = adaptOutputPort(dbService)

      // Create output
      const outputId = await port.createOutput({
        id: 'output-1',
        jobId: 'job-1',
        type: 'manga_page',
        format: 'png',
        path: 'output.png',
        metadata: { width: 800, height: 1200 },
      })

      expect(outputId).toBe('output-1')
    })
  })

  describe('adaptAll', () => {
    test('should create all ports with proper entities', () => {
      const ports = adaptAll(dbService)

      expect(ports.episode.entity).toBe('episode')
      expect(ports.episode.mode).toBe('rw')

      expect(ports.novel.entity).toBe('novel')
      expect(ports.novel.mode).toBe('rw')

      expect(ports.job.entity).toBe('job')
      expect(ports.job.mode).toBe('rw')

      expect(ports.output.entity).toBe('output')
      expect(ports.output.mode).toBe('rw')
    })

    test('should provide working ports for all entities', async () => {
      const ports = adaptAll(dbService)

      // Test novel operations
      await ports.novel.ensureNovel('novel-1', {
        title: 'Test Novel',
        author: 'Test Author',
        originalTextPath: 'test.txt',
        textLength: 1000,
        language: 'ja',
        metadataPath: null,
      })

      // Test job operations
      await ports.job.createJob({
        id: 'job-1',
        novelId: 'novel-1',
        title: 'Test Job',
        status: 'pending',
      })

      // Test episode operations
      await ports.episode.createEpisodes([
        {
          jobId: 'job-1',
          episodeNumber: 1,
          title: 'Test Episode',
          description: 'Test Description',
          startPosition: 0,
          endPosition: 100,
        },
      ])

      // Test output operations
      await ports.output.createOutput({
        id: 'output-1',
        jobId: 'job-1',
        type: 'manga_page',
        format: 'png',
        path: 'output.png',
        metadata: {},
      })

      // Verify all operations worked
      const novel = await ports.novel.getNovel('novel-1')
      const job = await ports.job.getJob('job-1')
      const episodes = await ports.episode.getEpisodesByJobId('job-1')

      expect(novel).toBeDefined()
      expect(job).toBeDefined()
      expect(episodes).toHaveLength(1)
    })
  })
})
