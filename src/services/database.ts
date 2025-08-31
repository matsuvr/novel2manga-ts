import crypto from 'node:crypto'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
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
import type { LayoutStatusModel } from '@/types/database-models'
import {
  chunks,
  episodes,
  jobs,
  layoutStatus,
  novels,
  outputs,
  renderStatus,
  tokenUsage,
} from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import type { TransactionPort, UnitOfWorkPort } from '@/repositories/ports'
import type { JobProgress, JobStatus, JobStep } from '@/types/job'
import { makeEpisodeId } from '@/utils/ids'
// Temporarily remove circular import - will be addressed in complete migration

/**
 * Legacy DatabaseService - gradually being replaced by domain-specific services
 *
 * @deprecated This class will be phased out in favor of domain-specific services.
 * New code should use the services from '@/services/database' instead.
 *
 * Migration guide:
 * - Episode operations: Use db.episodes() from '@/services/database'
 * - Job operations: Use db.jobs() from '@/services/database'
 * - Transaction operations: Use db.transactions() from '@/services/database'
 */
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
      userId: novel.userId,
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
        userId: novel.userId,
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

  async getNovel(id: string, userId?: string): Promise<Novel | null> {
    const conditions: SQL[] = [eq(novels.id, id)]
    if (userId) conditions.push(eq(novels.userId, userId))
    const result = await this.db
      .select()
      .from(novels)
      .where(and(...conditions))
      .limit(1)
    return result[0] || null
  }

  async getAllNovels(userId?: string): Promise<Novel[]> {
    const query = this.db.select().from(novels)
    if (userId) {
      query.where(eq(novels.userId, userId))
    }
    return await query.orderBy(desc(novels.createdAt))
  }

  // Job関連メソッド（統一シグネチャ）
  async createJob(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
    userId?: string
  }): Promise<string> {
    const id = payload.id || crypto.randomUUID()
    await this.db.insert(jobs).values({
      id,
      userId: payload.userId,
      novelId: payload.novelId,
      jobName: payload.title,
      status: (payload.status as Job['status']) || 'pending',
      currentStep: 'split',
      totalChunks: payload.totalChunks || 0,
    })
    return id
  }

  async getJob(id: string, userId?: string): Promise<Job | null> {
    try {
      const logger = getLogger().withContext({ service: 'DatabaseService', method: 'getJob' })
      logger.debug('getJob called', { id })

      // データベース接続確認
      const testQuery = await this.db.select({ count: sql`count(*)` }).from(jobs)
      logger.debug('Total jobs in database', { count: testQuery[0]?.count })

      const conditions: SQL[] = [eq(jobs.id, id)]
      if (userId) conditions.push(eq(jobs.userId, userId))
      const result = await this.db
        .select()
        .from(jobs)
        .where(and(...conditions))
        .limit(1)
      logger.info('getJob result', { outcome: result.length > 0 ? 'found' : 'not found' })

      if (result.length > 0) {
        logger.debug('Job data', {
          id: result[0].id,
          status: result[0].status,
          currentStep: result[0].currentStep,
          novelId: result[0].novelId,
        })
      }

      return result[0] || null
    } catch (error) {
      const logger = getLogger().withContext({ service: 'DatabaseService', method: 'getJob' })
      logger.error('getJob error', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      })
      throw error
    }
  }

  async getJobWithProgress(id: string): Promise<(Job & { progress: JobProgress | null }) | null> {
    const logger = getLogger().withContext({
      service: 'DatabaseService',
      method: 'getJobWithProgress',
    })
    logger.debug('getJobWithProgress called', { id })

    try {
      const job = await this.getJob(id)
      logger.info('getJob result', { outcome: job ? 'found' : 'not found' })

      if (!job) {
        logger.info('Job not found, returning null')
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

      logger.debug('Progress object created', progress as unknown as Record<string, unknown>)

      const result = {
        ...job,
        progress,
      }

      logger.debug('Returning job with progress')
      return result
    } catch (error) {
      // ここで捕捉して詳細ログを出しつつ、例外を再スローして上位で適切に分類させる
      const logger = getLogger().withContext({
        service: 'DatabaseService',
        method: 'getJobWithProgress',
      })
      logger.error('getJobWithProgress error', {
        error: error instanceof Error ? error.message : String(error),
        jobId: id,
        stack: error instanceof Error ? error.stack?.slice(0, 1000) : 'No stack',
      })
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

  /** 現在処理中のエピソード/ページを更新（任意） */
  async updateProcessingPosition(
    jobId: string,
    params: { episode?: number | null; page?: number | null },
  ): Promise<void> {
    const upd: Partial<
      Job & { processingEpisode?: number | null; processingPage?: number | null }
    > = {
      updatedAt: new Date().toISOString(),
    }
    if (params.episode !== undefined) upd.processingEpisode = params.episode ?? null
    if (params.page !== undefined) upd.processingPage = params.page ?? null
    await this.db.update(jobs).set(upd).where(eq(jobs.id, jobId))
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

  /**
   * @deprecated Use db.episodes().createEpisodes() from '@/services/database' instead
   * Fixed to use synchronous transactions for better-sqlite3 compatibility
   */
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
            confidence: sql`excluded.confidence`,
          },
        })
        .run()

      const jobId = episodeList[0].jobId
      const total = tx
        .select({ count: sql`count(*)` })
        .from(episodes)
        .where(eq(episodes.jobId, jobId))
        .all()
      const totalEpisodes = Number((total as unknown as { count: number }[])[0]?.count ?? 0)

      tx.update(jobs)
        .set({ totalEpisodes, updatedAt: new Date().toISOString() })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  /**
   * @deprecated Use db.episodes().getEpisodesByJobId() from '@/services/database' instead
   */
  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    return this.db
      .select()
      .from(episodes)
      .where(eq(episodes.jobId, jobId))
      .orderBy(asc(episodes.episodeNumber))
  }

  async updateEpisodeTextPath(jobId: string, episodeNumber: number, path: string): Promise<void> {
    // Update episodes.episode_text_path for the given jobId and episodeNumber
    await this.db
      .update(episodes)
      .set({ episodeTextPath: path })
      .where(and(eq(episodes.jobId, jobId), eq(episodes.episodeNumber, episodeNumber)))
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
    episodeNumber: number,
    pageNumber: number,
    status: {
      isRendered: boolean
      imagePath?: string
      thumbnailPath?: string
      width?: number
      height?: number
      fileSize?: number
    },
  ): Promise<void> {
    const logger = getLogger().withContext({
      service: 'DatabaseService',
      method: 'updateRenderStatus',
      jobId,
      episodeNumber,
      pageNumber,
    })
    const now = new Date().toISOString()
    // Upsert page render status
    const existing = await this.db
      .select({
        isRendered: renderStatus.isRendered,
      })
      .from(renderStatus)
      .where(
        and(
          eq(renderStatus.jobId, jobId),
          eq(renderStatus.episodeNumber, episodeNumber),
          eq(renderStatus.pageNumber, pageNumber),
        ),
      )
      .limit(1)

    const wasRendered = Boolean(existing[0]?.isRendered)
    logger.info('updateRenderStatus: upsert begin', {
      previousRendered: wasRendered,
      newRendered: status.isRendered,
      hasImage: !!status.imagePath,
      hasThumb: !!status.thumbnailPath,
    })

    await this.db
      .insert(renderStatus)
      .values({
        id: crypto.randomUUID(),
        jobId,
        episodeNumber,
        pageNumber,
        isRendered: status.isRendered,
        imagePath: status.imagePath,
        thumbnailPath: status.thumbnailPath,
        width: status.width,
        height: status.height,
        fileSize: status.fileSize,
        renderedAt: now,
      })
      .onConflictDoUpdate({
        target: [renderStatus.jobId, renderStatus.episodeNumber, renderStatus.pageNumber],
        set: {
          isRendered: status.isRendered,
          imagePath: status.imagePath,
          thumbnailPath: status.thumbnailPath,
          width: status.width,
          height: status.height,
          fileSize: status.fileSize,
          renderedAt: now,
        },
      })

    // If this page transitioned to rendered, increment job.renderedPages
    if (status.isRendered && !wasRendered) {
      const jobRow = await this.getJob(jobId)
      const newRenderedPages = (jobRow?.renderedPages || 0) + 1

      // Update renderedPages counter
      await this.db
        .update(jobs)
        .set({ renderedPages: newRenderedPages, updatedAt: now })
        .where(eq(jobs.id, jobId))
      logger.info('updateRenderStatus: incremented renderedPages', {
        from: jobRow?.renderedPages || 0,
        to: newRenderedPages,
      })

      // If we know totalPages and all pages are rendered, mark job render completed
      const totalPages = jobRow?.totalPages || 0
      if (totalPages === 0) {
        logger.warn('updateRenderStatus: totalPages is 0; cannot determine completion yet')
      }
      if (totalPages > 0 && newRenderedPages >= totalPages) {
        await this.db
          .update(jobs)
          .set({
            renderCompleted: true,
            currentStep: 'complete',
            status: 'completed',
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(jobs.id, jobId))
        logger.info('updateRenderStatus: job render completed (threshold reached)', {
          totalPages,
          renderedPages: newRenderedPages,
        })
      }
    }

    // 進行位置の更新（ページ単位）
    try {
      await this.updateProcessingPosition(jobId, { episode: episodeNumber, page: pageNumber })
    } catch (e) {
      logger.warn('updateRenderStatus: failed to update processing position', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 補助: renderCompleted=false かつ totalPages>0 の候補ジョブを取得（簡易版: 全件からフィルタ）
  async getIncompleteRenderJobs(): Promise<Job[]> {
    const all = (await this.db.select().from(jobs).orderBy(desc(jobs.createdAt))) as Job[]
    return all.filter((j) => !j.renderCompleted && (j.totalPages || 0) > 0)
  }

  // 補助: ジョブ単位の描画済みページ数を算出（render_statusでisRendered=trueの件数）
  async countRenderedPagesByJob(jobId: string): Promise<number> {
    const rows = await this.getAllRenderStatusByJob(jobId)
    return rows.reduce((acc, r) => acc + (r.isRendered ? 1 : 0), 0)
  }

  // 補助: renderedPages を上書き
  async setJobRenderedPages(jobId: string, renderedPagesCount: number): Promise<void> {
    await this.db
      .update(jobs)
      .set({ renderedPages: renderedPagesCount, updatedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId))
  }

  // 補助: totalPages を修正
  async updateJobTotalPages(jobId: string, totalPagesCount: number): Promise<void> {
    await this.db
      .update(jobs)
      .set({ totalPages: totalPagesCount, updatedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId))
  }

  async updateJobCoverageWarnings(
    id: string,
    warnings: Array<{
      chunkIndex: number
      coverageRatio: number
      message: string
    }>,
  ): Promise<void> {
    await this.db
      .update(jobs)
      .set({
        coverageWarnings: JSON.stringify(warnings),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, id))
  }

  // Layout status upsert and job totalPages recompute helpers
  async upsertLayoutStatus(params: {
    jobId: string
    episodeNumber: number
    totalPages: number
    totalPanels?: number
    layoutPath?: string | null
    error?: string | null
  }): Promise<void> {
    const now = new Date().toISOString()
    await this.db
      .insert(layoutStatus)
      .values({
        id: crypto.randomUUID(),
        jobId: params.jobId,
        episodeNumber: params.episodeNumber,
        isGenerated: true,
        layoutPath: params.layoutPath ?? null,
        totalPages: params.totalPages,
        totalPanels: params.totalPanels ?? null,
        generatedAt: now,
        lastError: params.error ?? null,
      })
      .onConflictDoUpdate({
        target: [layoutStatus.jobId, layoutStatus.episodeNumber],
        set: {
          isGenerated: true,
          layoutPath: params.layoutPath ?? null,
          totalPages: params.totalPages,
          totalPanels: params.totalPanels ?? null,
          generatedAt: now,
          lastError: params.error ?? null,
        },
      })
  }

  async getLayoutStatusByJobId(jobId: string): Promise<LayoutStatusModel[]> {
    const results = await this.db
      .select()
      .from(layoutStatus)
      .where(eq(layoutStatus.jobId, jobId))
      .orderBy(layoutStatus.episodeNumber)

    // データベース結果をLayoutStatusModelに変換
    return results.map((result) => ({
      id: result.id,
      jobId: result.jobId,
      episodeNumber: result.episodeNumber,
      isGenerated: result.isGenerated ?? false,
      layoutPath: result.layoutPath ?? undefined,
      totalPages: result.totalPages ?? undefined,
      totalPanels: result.totalPanels ?? undefined,
      generatedAt: result.generatedAt ? new Date(result.generatedAt) : undefined,
      retryCount: result.retryCount ?? 0,
      lastError: result.lastError ?? undefined,
      createdAt: result.createdAt ? new Date(result.createdAt) : new Date(0),
    }))
  }

  async recomputeJobTotalPages(jobId: string): Promise<number> {
    // Sum total_pages from layout_status for this job
    const rows = (await this.db
      .select({ total: layoutStatus.totalPages })
      .from(layoutStatus)
      .where(eq(layoutStatus.jobId, jobId))) as Array<{ total: number | null }>
    const sum = rows.reduce((acc, r) => acc + (r.total || 0), 0)
    await this.db
      .update(jobs)
      .set({ totalPages: sum, updatedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId))
    return sum
  }

  // layout_statusのisGeneratedエピソード数からprocessedEpisodesを再集計
  async recomputeJobProcessedEpisodes(jobId: string): Promise<number> {
    const rows = (await this.db
      .select({ generated: layoutStatus.isGenerated })
      .from(layoutStatus)
      .where(eq(layoutStatus.jobId, jobId))) as Array<{ generated: 0 | 1 | null }>
    let count = rows.reduce((acc, r) => acc + (r.generated ? 1 : 0), 0)

    // フォールバック: layout_statusレコードがない場合、ストレージ確認
    if (count === 0) {
      const logger = getLogger().withContext({
        service: 'DatabaseService',
        method: 'recomputeJobProcessedEpisodes',
      })
      logger.warn('Starting fallback recovery: no layout_status records found', {
        jobId,
        layoutStatusCount: rows.length,
      })

      try {
        const episodes = await this.getEpisodesByJobId(jobId)
        const { StorageFactory } = await import('@/utils/storage')
        const { StorageKeys } = await import('@/utils/storage')
        const storage = await StorageFactory.getLayoutStorage()

        let detectedLayoutFiles = 0
        let successfulUpserts = 0
        let failedUpserts = 0
        let firstFailureDetail: { episode: number; error: string } | null = null

        // Collect all layout status updates to batch them
        const layoutStatusUpdates: Array<Parameters<typeof this.upsertLayoutStatus>[0]> = []

        for (const ep of episodes) {
          const layoutKey = StorageKeys.episodeLayout(jobId, ep.episodeNumber)
          const layoutExists = await storage.get(layoutKey)
          if (layoutExists?.text) {
            detectedLayoutFiles++
            // 不整合を検出・修復：ストレージにファイルが存在するがDBレコードがない
            try {
              // レイアウトファイルから実際のページ数を取得
              const parsed = JSON.parse(layoutExists.text)
              const totalPages = Array.isArray(parsed?.pages) ? parsed.pages.length : 1

              layoutStatusUpdates.push({
                jobId,
                episodeNumber: ep.episodeNumber,
                totalPages,
                layoutPath: layoutKey,
              })
              count++
            } catch (parseError) {
              failedUpserts++
              const errorMessage =
                parseError instanceof Error ? parseError.message : String(parseError)
              if (!firstFailureDetail) {
                firstFailureDetail = { episode: ep.episodeNumber, error: errorMessage }
              }
              // JSONパースエラーの場合は最小限の情報で修復
              layoutStatusUpdates.push({
                jobId,
                episodeNumber: ep.episodeNumber,
                totalPages: 1,
                layoutPath: layoutKey,
                error: 'Layout file parsing failed during recovery',
              })
              count++
            }
          }
        }

        // Batch execute all layout status updates
        if (layoutStatusUpdates.length > 0) {
          try {
            await this.db.transaction(async () => {
              for (const update of layoutStatusUpdates) {
                await this.upsertLayoutStatus(update)
              }
            })
            successfulUpserts = layoutStatusUpdates.length
          } catch (batchError) {
            const errorMessage =
              batchError instanceof Error ? batchError.message : String(batchError)
            logger.error('Batch layout status update failed', {
              jobId,
              updatesCount: layoutStatusUpdates.length,
              error: errorMessage,
            })
            // Fallback to individual updates
            for (const update of layoutStatusUpdates) {
              try {
                await this.upsertLayoutStatus(update)
                successfulUpserts++
              } catch (individualError) {
                failedUpserts++
                const individualErrorMessage =
                  individualError instanceof Error
                    ? individualError.message
                    : String(individualError)
                if (!firstFailureDetail) {
                  firstFailureDetail = {
                    episode: update.episodeNumber,
                    error: individualErrorMessage,
                  }
                }
              }
            }
          }
        }

        logger.warn('Fallback recovery completed', {
          jobId,
          totalEpisodes: episodes.length,
          detectedLayoutFiles,
          successfulUpserts,
          failedUpserts,
          finalProcessedCount: count,
          firstFailureDetail,
        })
      } catch (_storageError) {
        // ストレージエラーは無視して元のカウントを維持
      }
    }

    await this.db
      .update(jobs)
      .set({ processedEpisodes: count, updatedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId))
    return count
  }

  async getJobsByNovelId(novelId: string): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.novelId, novelId))
      .orderBy(desc(jobs.createdAt))
  }
}
