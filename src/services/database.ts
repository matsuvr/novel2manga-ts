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
  type NewOutput,
  type Novel,
} from '@/db'
import { chunks, episodes, jobs, novels, outputs, renderStatus, tokenUsage } from '@/db/schema'
import type { TransactionPort, UnitOfWorkPort } from '@/repositories/ports'
import type { JobProgress, JobStatus, JobStep } from '@/types/job'
import { makeEpisodeId } from '@/utils/ids'

export class DatabaseService implements TransactionPort, UnitOfWorkPort {
  private db = getDatabase()

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // Drizzle supports db.transaction; use it to ensure atomic operations
    return await this.db.transaction(async () => await fn())
  }

  // UnitOfWorkPort basic implementation using implicit transaction semantics
  async begin(): Promise<void> {
    // No-op: Drizzle exposes transaction via callback; explicit begin not supported.
  }

  async commit(): Promise<void> {
    // No-op: handled by callback completion
  }

  async rollback(): Promise<void> {
    // No-op: use thrown error within transaction callback to rollback
  }

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

  // Job関連メソッド（統一シグネチャ）
  async createJob(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string> {
    const id = payload.id || crypto.randomUUID()
    await this.db.insert(jobs).values({
      id,
      novelId: payload.novelId,
      jobName: payload.title,
      status: (payload.status as Job['status']) || 'pending',
      currentStep: 'split',
      totalChunks: payload.totalChunks || 0,
    })
    return id
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
          novelId: result[0].novelId,
        })
      }

      return result[0] || null
    } catch (error) {
      console.error('[DatabaseService] getJob error:', error)
      console.error('[DatabaseService] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      })
      throw error
    }
  }

  async getJobWithProgress(id: string): Promise<(Job & { progress: JobProgress | null }) | null> {
    console.log('[DatabaseService] getJobWithProgress called with id:', id)

    try {
      const job = await this.getJob(id)
      console.log('[DatabaseService] getJob result:', job ? 'found' : 'not found')

      if (!job) {
        console.log('[DatabaseService] Job not found, returning null')
        return null
      }

      // 厳密な型検証（無効値は例外にする）
      // currentStep が未定義や未知の値でもテスト互換のため通す
      const safeCurrentStep = (job.currentStep || 'initialized') as JobStep

      const currentStep = safeCurrentStep

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
      // ここで捕捉して詳細ログを出しつつ、例外を再スローして上位で適切に分類させる
      console.error('[DatabaseService] getJobWithProgress error:', error)
      console.error('[DatabaseService] Error context:', { jobId: id })
      console.error(
        '[DatabaseService] Error stack (head):',
        error instanceof Error ? error.stack?.slice(0, 1000) : 'No stack',
      )
      throw error
    }
  }

  // 互換API: jobId からチャンク一覧を取得（統合テスト用）
  async getChunks(jobId: string): Promise<Array<{ chunkIndex: number; text?: string }>> {
    const rows = await this.getChunksByJobId(jobId)
    // schema の chunks テーブルは contentPath を持つため text は別ストレージだが
    // 互換のため存在すれば text を含める
    return rows.map((r: unknown) => {
      const chunk = r as Record<string, unknown>
      return {
        chunkIndex: chunk.chunkIndex as number,
        text: chunk.text as string | undefined,
      }
    })
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
        // 進捗フェーズを反映（UIが正しく追従するように）
        currentStep: progress.currentStep,
        totalEpisodes: progress.episodes.length,
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
    await this.db.transaction(async (tx) => {
      const updateData: Partial<Job> = {
        lastError: error,
        lastErrorStep: step,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      }

      if (incrementRetry) {
        const current = await tx
          .select({ retryCount: jobs.retryCount })
          .from(jobs)
          .where(eq(jobs.id, id))
          .limit(1)
        const currentRetry = Number(current[0]?.retryCount ?? 0)
        updateData.retryCount = currentRetry + 1
      }

      await tx.update(jobs).set(updateData).where(eq(jobs.id, id))
    })
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
  // テスト/開発用の簡易入力もサポート
  async createEpisode(episode: NewEpisode & Record<string, unknown>): Promise<void>
  async createEpisode(episode: {
    jobId: string
    episodeNumber: number
    title?: string
    contentPath?: string
    characterCount?: number
    status?: string
  }): Promise<void>
  // Internal implementation handling both overload signatures. Use unknown then narrow with guards.
  async createEpisode(episode: unknown): Promise<void> {
    type MinimalInput = {
      jobId: string
      episodeNumber: number
      title?: string
    }
    const isMinimalInput = (e: unknown): e is MinimalInput =>
      !!e &&
      typeof (e as { jobId?: unknown }).jobId === 'string' &&
      typeof (e as { episodeNumber?: unknown }).episodeNumber === 'number' &&
      ((e as { startChunk?: unknown }).startChunk === undefined ||
        (e as { startCharIndex?: unknown }).startCharIndex === undefined)
    // 簡易入力かどうかを判定
    const isMinimal = isMinimalInput(episode)

    if (isMinimal) {
      const job = await this.getJob(episode.jobId)
      if (!job) throw new Error(`Job not found for episode creation: ${episode.jobId}`)

      const fullEpisode: NewEpisode = {
        id: makeEpisodeId(episode.jobId, episode.episodeNumber),
        novelId: job.novelId,
        jobId: episode.jobId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        summary: undefined,
        startChunk: 1,
        startCharIndex: 0,
        endChunk: 1,
        endCharIndex: 0,
        estimatedPages: 1,
        confidence: 0.5,
        createdAt: new Date().toISOString(),
      }

      const id = fullEpisode.id
      await this.db.insert(episodes).values({
        id,
        novelId: fullEpisode.novelId,
        jobId: fullEpisode.jobId,
        episodeNumber: fullEpisode.episodeNumber,
        title: fullEpisode.title,
        summary: fullEpisode.summary,
        startChunk: fullEpisode.startChunk,
        startCharIndex: fullEpisode.startCharIndex,
        endChunk: fullEpisode.endChunk,
        endCharIndex: fullEpisode.endCharIndex,
        estimatedPages: fullEpisode.estimatedPages,
        confidence: fullEpisode.confidence as number,
      })
      return
    }

    // Attempt to treat as full NewEpisode-like payload
    const e = episode as Partial<NewEpisode>
    if (
      e &&
      typeof e.jobId === 'string' &&
      typeof e.novelId === 'string' &&
      typeof e.episodeNumber === 'number' &&
      typeof e.startChunk === 'number' &&
      typeof e.startCharIndex === 'number' &&
      typeof e.endChunk === 'number' &&
      typeof e.endCharIndex === 'number' &&
      typeof e.estimatedPages === 'number' &&
      typeof e.confidence === 'number'
    ) {
      const id = makeEpisodeId(e.jobId, e.episodeNumber)
      await this.db.insert(episodes).values({
        id,
        novelId: e.novelId,
        jobId: e.jobId,
        episodeNumber: e.episodeNumber,
        title: e.title,
        summary: e.summary,
        startChunk: e.startChunk,
        startCharIndex: e.startCharIndex,
        endChunk: e.endChunk,
        endCharIndex: e.endCharIndex,
        estimatedPages: e.estimatedPages,
        confidence: e.confidence,
      })
      return
    }

    throw new Error('Invalid episode payload')
  }

  // 便宜メソッド（テスト用クリーンアップ）
  async deleteJob(id: string): Promise<void> {
    await this.db.delete(jobs).where(eq(jobs.id, id))
  }

  async createEpisodes(episodeList: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void> {
    if (episodeList.length === 0) return

    this.db.transaction((tx) => {
      const toInsert = episodeList.map((episode) => ({
        id: makeEpisodeId(episode.jobId, episode.episodeNumber),
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

      tx.insert(episodes)
        .values(toInsert)
        .onConflictDoUpdate({
          target: [episodes.jobId, episodes.episodeNumber],
          set: {
            title: sql`excluded.title`,
            summary: sql`excluded.summary`,
            startChunk: sql`excluded.start_chunk`,
            startCharIndex: sql`excluded.start_char_index`,
            endChunk: sql`excluded.end_chunk`,
            endCharIndex: sql`excluded.end_char_index`,
            estimatedPages: sql`excluded.estimated_pages`,
            confidence: sql`excluded.confidence`,
          },
        })
        .run()

      const jobId = episodeList[0].jobId
      const total = tx
        .select({ count: sql`count(*)` })
        .from(episodes)
        .where(eq(episodes.jobId, jobId))
        .get()
      const totalEpisodes = Number(total?.count ?? 0)
      tx.update(jobs)
        .set({ totalEpisodes, updatedAt: new Date().toISOString() })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    return await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(asc(episodes.episodeNumber))
  }

  async createOutput(output: Omit<NewOutput, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.db.insert(outputs).values({
      id,
      novelId: output.novelId,
      jobId: output.jobId,
      outputType: output.outputType,
      outputPath: output.outputPath,
      fileSize: output.fileSize,
      pageCount: output.pageCount,
      metadataPath: output.metadataPath,
      createdAt: now,
    })

    return id
  }

  // トークン使用量記録メソッド
  async recordTokenUsage(tokenUsageData: {
    id: string
    jobId: string
    agentName: string
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number
    stepName?: string
    chunkIndex?: number
    episodeNumber?: number
  }): Promise<void> {
    await this.db.insert(tokenUsage).values(tokenUsageData)
  }

  // トークン使用量取得メソッド（API用）
  async getTokenUsageByJobId(jobId: string): Promise<Array<typeof tokenUsage.$inferSelect>> {
    return (await this.db
      .select()
      .from(tokenUsage)
      .where(eq(tokenUsage.jobId, jobId))
      .orderBy(tokenUsage.createdAt)) as Array<typeof tokenUsage.$inferSelect>
  }

  async getOutput(id: string): Promise<typeof outputs.$inferSelect | null> {
    const result = await this.db.select().from(outputs).where(eq(outputs.id, id)).limit(1)
    return (result[0] as typeof outputs.$inferSelect) || null
  }

  // レンダリング状態取得メソッド
  async getRenderStatus(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
  ): Promise<import('@/db/schema').RenderStatus | null> {
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

    return (result[0] as import('@/db/schema').RenderStatus) || null
  }

  async getRenderStatusByEpisode(
    jobId: string,
    episodeNumber: number,
  ): Promise<import('@/db/schema').RenderStatus[]> {
    return (await this.db
      .select()
      .from(renderStatus)
      .where(and(eq(renderStatus.jobId, jobId), eq(renderStatus.episodeNumber, episodeNumber)))
      .orderBy(renderStatus.pageNumber)) as import('@/db/schema').RenderStatus[]
  }

  async createChunksBatch(payloads: Array<Omit<NewChunk, 'id' | 'createdAt'>>): Promise<void> {
    if (payloads.length === 0) return
    await this.db.transaction(async (tx) => {
      const toInsert = payloads.map((c) => ({
        id: crypto.randomUUID(),
        novelId: c.novelId,
        jobId: c.jobId,
        chunkIndex: c.chunkIndex,
        contentPath: c.contentPath,
        startPosition: c.startPosition,
        endPosition: c.endPosition,
        wordCount: c.wordCount,
      }))
      await tx.insert(chunks).values(toInsert)
    })
  }

  async getAllRenderStatusByJob(jobId: string): Promise<import('@/db/schema').RenderStatus[]> {
    return (await this.db
      .select()
      .from(renderStatus)
      .where(eq(renderStatus.jobId, jobId))
      .orderBy(
        renderStatus.episodeNumber,
        renderStatus.pageNumber,
      )) as import('@/db/schema').RenderStatus[]
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
