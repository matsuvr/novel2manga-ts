import crypto from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import {
  type Chunk,
  type Episode,
  getDatabase,
  type Job,
  type NewChunk,
  type NewEpisode,
  type NewNovel,
  type Novel,
} from '@/db'
import { chunks, episodes, jobs, novels, outputs, renderStatus } from '@/db/schema'
import type { JobProgress, JobStatus, JobStep } from '@/types/job'

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
      updatedAt: now,
    })

    return id
  }

  async ensureNovel(
    id: string,
    novel: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const now = new Date().toISOString()

    await this.db
      .insert(novels)
      .values({
        id,
        title: novel.title,
        author: novel.author,
        originalTextPath: novel.originalTextPath,
        textLength: novel.textLength,
        language: novel.language || 'ja',
        metadataPath: novel.metadataPath,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }

  async getNovel(id: string): Promise<Novel | null> {
    const result = await this.db.select().from(novels).where(eq(novels.id, id)).limit(1)
    return result[0] || null
  }

  async getAllNovels(): Promise<Novel[]> {
    return await this.db.select().from(novels).orderBy(desc(novels.createdAt))
  }

  // Job関連メソッド
  async createJob(id: string, novelId: string, jobName?: string): Promise<void> {
    await this.db.insert(jobs).values({
      id,
      novelId,
      jobName,
      status: 'pending',
      currentStep: 'initialized',
    })
  }

  async getJob(id: string): Promise<Job | null> {
    try {
      console.log('[DatabaseService] getJob called for id:', id)
      
      // データベース接続確認
      const testQuery = await this.db.select({ count: sql`count(*)` }).from(jobs)
      console.log('[DatabaseService] Total jobs in database:', testQuery[0]?.count)
      
      const result = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1)
      console.log('[DatabaseService] getJob result:', result.length > 0 ? 'found' : 'not found')
      
      if (result.length > 0) {
        console.log('[DatabaseService] Job data:', {
          id: result[0].id,
          status: result[0].status,
          currentStep: result[0].currentStep,
          novelId: result[0].novelId
        })
      }
      
      return result[0] || null
    } catch (error) {
      console.error('[DatabaseService] getJob error:', error)
      console.error('[DatabaseService] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined
      })
      throw error
    }
  }

  async getJobWithProgress(id: string): Promise<(Job & { progress: JobProgress | null }) | null> {
    try {
      console.log('[DatabaseService] getJobWithProgress called with id:', id)
      
      const job = await this.getJob(id)
      console.log('[DatabaseService] getJob result:', job ? 'found' : 'not found')
      
      if (!job) {
        console.log('[DatabaseService] Job not found, returning null')
        return null
      }

      // 厳密な型変換 - フォールバックなし
      if (!job.currentStep) {
        throw new Error(`Job ${job.id} has no currentStep set`)
      }

      const validSteps: JobStep[] = ['initialized', 'split', 'analyze', 'episode', 'layout', 'render', 'complete']
      if (!validSteps.includes(job.currentStep as JobStep)) {
        throw new Error(`Job ${job.id} has invalid currentStep: ${job.currentStep}. Valid steps: ${validSteps.join(', ')}`)
      }

      const currentStep = job.currentStep as JobStep

      // シンプルなJobProgressオブジェクトを構築
      const progress: JobProgress = {
        currentStep,
        processedChunks: job.processedChunks || 0,
        totalChunks: job.totalChunks || 0,
        episodes: [], // TODO: 実際のエピソードデータを取得
      }

      console.log('[DatabaseService] Progress object created:', progress)

      const result = {
        ...job,
        progress,
      }
      
      console.log('[DatabaseService] Returning job with progress')
      return result
    } catch (error) {
      console.error('[DatabaseService] getJobWithProgress error:', error)
      console.error('[DatabaseService] Error stack:', error instanceof Error ? error.stack : 'No stack')
      return null
    }
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const updateData: Partial<Job> = {
      status,
      updatedAt: new Date().toISOString(),
    }

    if (error) {
      updateData.lastError = error
    }

    await this.db.update(jobs).set(updateData).where(eq(jobs.id, id))
  }

  async updateJobProgress(id: string, progress: JobProgress): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        processedChunks: progress.processedChunks,
        totalEpisodes: progress.episodes.length,
        currentStep: progress.currentStep,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, id))
  }

  async updateJobStep(
    id: string,
    currentStep: string,
    processedChunks?: number,
    totalChunks?: number,
    error?: string,
    errorStep?: string,
  ): Promise<void> {
    const updateData: Partial<Job> = {
      currentStep,
      updatedAt: new Date().toISOString(),
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

  async updateJobError(
    id: string,
    error: string,
    step: string,
    incrementRetry = true,
  ): Promise<void> {
    const updateData: Partial<Job> = {
      lastError: error,
      lastErrorStep: step,
      status: 'failed',
      updatedAt: new Date().toISOString(),
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

  async markJobStepCompleted(
    id: string,
    stepType: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
  ): Promise<void> {
    const updateData: Partial<Job> = {
      updatedAt: new Date().toISOString(),
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
      wordCount: chunk.wordCount,
    })

    return id
  }

  async getChunksByJobId(jobId: string): Promise<Chunk[]> {
    return await this.db
      .select()
      .from(chunks)
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
      confidence: episode.confidence,
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
      confidence: episode.confidence,
    }))

    await this.db.insert(episodes).values(episodesToInsert)
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    return await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(asc(episodes.episodeNumber))
  }

  async createOutput(output: Omit<typeof outputs.$inferInsert, 'createdAt'>): Promise<string> {
    const result = await this.db.insert(outputs).values(output).returning({ id: outputs.id })
    return result[0].id
  }

  // レンダリング状態取得メソッド
  async getRenderStatus(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
  ): Promise<any | null> {
    const result = await this.db
      .select()
      .from(renderStatus)
      .where(
        and(
          eq(renderStatus.jobId, jobId),
          eq(renderStatus.episodeNumber, episodeNumber),
          eq(renderStatus.pageNumber, pageNumber),
        ),
      )
      .limit(1)

    return result[0] || null
  }

  async getRenderStatusByEpisode(jobId: string, episodeNumber: number): Promise<any[]> {
    return await this.db
      .select()
      .from(renderStatus)
      .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
      .orderBy(renderStatus.pageNumber)
  }

  async getAllRenderStatusByJob(jobId: string): Promise<any[]> {
    return await this.db
      .select()
      .from(renderStatus)
      .where(eq(renderStatus.jobId, jobId))
      .orderBy(renderStatus.episodeNumber, renderStatus.pageNumber)
  }

  async updateRenderStatus(
    jobId: string,
    _episodeNumber: number,
    _pageNumber: number,
    _status: {
      isRendered: boolean
      imagePath?: string
      thumbnailPath?: string
      width?: number
      height?: number
      fileSize?: number
    },
  ): Promise<void> {
    const now = new Date().toISOString()

    // render_statusテーブルが存在しない場合は、jobsテーブルのrenderCompletedフラグを更新
    const currentJob = await this.getJob(jobId)
    if (currentJob) {
      await this.db
        .update(jobs)
        .set({
          renderedPages: (currentJob.renderedPages || 0) + 1,
          updatedAt: now,
        })
        .where(eq(jobs.id, jobId))
    }

    // TODO: render_statusテーブルが実装されたら、以下のコードに置き換える
    // await this.db.update(renderStatus)
    //   .set({
    //     isRendered: status.isRendered,
    //     imagePath: status.imagePath,
    //     thumbnailPath: status.thumbnailPath,
    //     width: status.width,
    //     height: status.height,
    //     fileSize: status.fileSize,
    //     renderedAt: now,
    //   })
    //   .where(
    //     and(
    //       eq(renderStatus.jobId, jobId),
    //       eq(renderStatus.episodeNumber, episodeNumber),
    //       eq(renderStatus.pageNumber, pageNumber)
    //     )
    //   )
    //   .execute()
  }

  async getJobsByNovelId(novelId: string): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.novelId, novelId))
      .orderBy(desc(jobs.createdAt))
  }
}
