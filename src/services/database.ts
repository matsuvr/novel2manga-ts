import crypto from 'node:crypto'
import { eq, asc } from 'drizzle-orm'
import { getDatabase, type Novel, type Job, type Chunk, type Episode, type NewNovel, type NewJob, type NewChunk, type NewEpisode } from '@/db'
import { novels, jobs, chunks, episodes } from '@/db/schema'
import type { JobProgress, JobStatus, ExtendedJob } from '@/types/job'

export class DatabaseService {
  private db = getDatabase()

  // Novel関連メソッド
  async createNovel(novel: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await this.db.insert(novels).values({
      id,
      title: novel.title,
      author: novel.author,
      originalTextPath: novel.originalTextPath,
      textLength: novel.textLength,
      language: novel.language || 'ja',
      metadataPath: novel.metadataPath,
      createdAt: now,
      updatedAt: now
    })
    
    return id
  }

  async ensureNovel(
    id: string,
    novel: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    const now = new Date().toISOString()
    
    await this.db.insert(novels).values({
      id,
      title: novel.title,
      author: novel.author,
      originalTextPath: novel.originalTextPath,
      textLength: novel.textLength,
      language: novel.language || 'ja',
      metadataPath: novel.metadataPath,
      createdAt: now,
      updatedAt: now
    }).onConflictDoNothing()
  }

  async getNovel(id: string): Promise<Novel | null> {
    const result = await this.db.select().from(novels).where(eq(novels.id, id)).limit(1)
    return result[0] || null
  }

  // Job関連メソッド
  async createJob(id: string, novelId: string, jobName?: string): Promise<void> {
    await this.db.insert(jobs).values({
      id,
      novelId,
      jobName,
      status: 'pending',
      currentStep: 'initialized'
    })
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1)
    return result[0] || null
  }

  async getExtendedJob(id: string): Promise<ExtendedJob | null> {
    const job = await this.getJob(id)
    if (!job) return null

    // resume_data_pathからprogressを読み込む（実装が必要な場合）
    let progress: JobProgress | null = null
    if (job.resumeDataPath) {
      // TODO: ストレージからprogressを読み込む
      progress = null
    }

    return {
      ...job,
      status: job.status as JobStatus,
      progress
    }
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const updateData: Partial<Job> = {
      status,
      updatedAt: new Date().toISOString()
    }
    
    if (error) {
      updateData.lastError = error
    }

    await this.db.update(jobs).set(updateData).where(eq(jobs.id, id))
  }

  async updateJobProgress(id: string, progress: JobProgress): Promise<void> {
    await this.db.update(jobs).set({
      processedChunks: progress.processedChunks,
      totalEpisodes: progress.episodes.length,
      currentStep: progress.currentStep,
      updatedAt: new Date().toISOString()
    }).where(eq(jobs.id, id))
  }

  async updateJobStep(
    id: string,
    currentStep: string,
    processedChunks?: number,
    totalChunks?: number,
    error?: string,
    errorStep?: string
  ): Promise<void> {
    const updateData: Partial<Job> = {
      currentStep,
      updatedAt: new Date().toISOString()
    }

    if (processedChunks !== undefined) {
      updateData.processedChunks = processedChunks
    }

    if (totalChunks !== undefined) {
      updateData.totalChunks = totalChunks
    }

    if (error) {
      updateData.lastError = error
      updateData.lastErrorStep = errorStep || currentStep
    }

    await this.db.update(jobs).set(updateData).where(eq(jobs.id, id))
  }

  async updateJobError(id: string, error: string, step: string, incrementRetry = true): Promise<void> {
    const updateData: Partial<Job> = {
      lastError: error,
      lastErrorStep: step,
      status: 'failed',
      updatedAt: new Date().toISOString()
    }

    if (incrementRetry) {
      // Drizzleでretry_count + 1を行う
      const currentJob = await this.getJob(id)
      if (currentJob) {
        updateData.retryCount = (currentJob.retryCount || 0) + 1
      }
    }

    await this.db.update(jobs).set(updateData).where(eq(jobs.id, id))
  }

  async markJobStepCompleted(id: string, stepType: 'split' | 'analyze' | 'episode' | 'layout' | 'render'): Promise<void> {
    const updateData: Partial<Job> = {
      updatedAt: new Date().toISOString()
    }

    switch (stepType) {
      case 'split':
        updateData.splitCompleted = true
        break
      case 'analyze':
        updateData.analyzeCompleted = true
        break
      case 'episode':
        updateData.episodeCompleted = true
        break
      case 'layout':
        updateData.layoutCompleted = true
        break
      case 'render':
        updateData.renderCompleted = true
        break
    }

    await this.db.update(jobs).set(updateData).where(eq(jobs.id, id))
  }

  // Chunk関連メソッド
  async createChunk(chunk: Omit<NewChunk, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID()
    
    await this.db.insert(chunks).values({
      id,
      novelId: chunk.novelId,
      jobId: chunk.jobId,
      chunkIndex: chunk.chunkIndex,
      contentPath: chunk.contentPath,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      wordCount: chunk.wordCount
    })
    
    return id
  }

  async getChunksByJobId(jobId: string): Promise<Chunk[]> {
    return await this.db.select().from(chunks)
      .where(eq(chunks.jobId, jobId))
      .orderBy(asc(chunks.chunkIndex))
  }

  // Episode関連メソッド
  async createEpisode(episode: NewEpisode): Promise<void> {
    const id = `${episode.jobId}-ep${episode.episodeNumber}`
    
    await this.db.insert(episodes).values({
      id,
      novelId: episode.novelId,
      jobId: episode.jobId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      summary: episode.summary,
      startChunk: episode.startChunk,
      startCharIndex: episode.startCharIndex,
      endChunk: episode.endChunk,
      endCharIndex: episode.endCharIndex,
      estimatedPages: episode.estimatedPages,
      confidence: episode.confidence
    })
  }

  async createEpisodes(episodeList: NewEpisode[]): Promise<void> {
    const episodesToInsert = episodeList.map((episode) => ({
      id: `${episode.jobId}-ep${episode.episodeNumber}`,
      novelId: episode.novelId,
      jobId: episode.jobId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      summary: episode.summary,
      startChunk: episode.startChunk,
      startCharIndex: episode.startCharIndex,
      endChunk: episode.endChunk,
      endCharIndex: episode.endCharIndex,
      estimatedPages: episode.estimatedPages,
      confidence: episode.confidence
    }))

    await this.db.insert(episodes).values(episodesToInsert)
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    return await this.db.select().from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(asc(episodes.episodeNumber))
  }
}
