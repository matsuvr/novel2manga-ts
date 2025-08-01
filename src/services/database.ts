import crypto from 'node:crypto'
import type { Chunk, Episode, ExtendedJob, Job, JobProgress, JobStatus, Novel } from '@/types'
import type { DatabaseAdapter } from '@/utils/storage'

export class DatabaseService {
  constructor(private db: DatabaseAdapter) {}

  // Novel関連メソッド
  async createNovel(novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date()
    await this.db.run(
      `INSERT INTO novels (id, title, author, original_text_path, text_length, language, metadata_path, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        novel.title || null,
        novel.author || null,
        novel.originalTextPath,
        novel.textLength,
        novel.language,
        novel.metadataPath || null,
        now,
        now,
      ],
    )
    return id
  }

  async getNovel(id: string): Promise<Novel | null> {
    const result = await this.db.get('SELECT * FROM novels WHERE id = ?', [id])

    if (!result) return null

    return {
      id: result.id,
      title: result.title,
      author: result.author,
      originalTextPath: result.original_text_path,
      textLength: result.text_length,
      language: result.language,
      metadataPath: result.metadata_path,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
    }
  }

  // Job関連メソッド
  async createJob(id: string, novelId: string, jobName?: string): Promise<void> {
    await this.db.run(
      'INSERT INTO jobs (id, novel_id, job_name, status, current_step) VALUES (?, ?, ?, ?, ?)',
      [id, novelId, jobName || null, 'pending', 'initialized'],
    )
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.db.get('SELECT * FROM jobs WHERE id = ?', [id])

    if (!result) return null

    // データベースの結果を型に変換
    return {
      id: result.id,
      novelId: result.novel_id,
      jobName: result.job_name,
      status: result.status,
      currentStep: result.current_step,
      splitCompleted: result.split_completed,
      analyzeCompleted: result.analyze_completed,
      episodeCompleted: result.episode_completed,
      layoutCompleted: result.layout_completed,
      renderCompleted: result.render_completed,
      chunksDirPath: result.chunks_dir_path,
      analysesDirPath: result.analyses_dir_path,
      episodesDataPath: result.episodes_data_path,
      layoutsDirPath: result.layouts_dir_path,
      rendersDirPath: result.renders_dir_path,
      totalChunks: result.total_chunks,
      processedChunks: result.processed_chunks,
      totalEpisodes: result.total_episodes,
      processedEpisodes: result.processed_episodes,
      totalPages: result.total_pages,
      renderedPages: result.rendered_pages,
      lastError: result.last_error,
      lastErrorStep: result.last_error_step,
      retryCount: result.retry_count,
      resumeDataPath: result.resume_data_path,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
      startedAt: result.started_at ? new Date(result.started_at) : undefined,
      completedAt: result.completed_at ? new Date(result.completed_at) : undefined,
    }
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
      progress,
    }
  }

  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    const query = error
      ? 'UPDATE jobs SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      : 'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'

    const params = error ? [status, error, id] : [status, id]
    await this.db.run(query, params)
  }

  async updateJobProgress(id: string, progress: JobProgress): Promise<void> {
    // progressはresume_data_pathに保存する必要がある場合の処理
    await this.db.run(
      `UPDATE jobs 
       SET processed_chunks = ?, 
           total_episodes = ?,
           current_step = ?,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [progress.processedChunks, progress.episodes.length, progress.currentStep, id],
    )
  }

  // Chunk関連メソッド
  async createChunk(chunk: Omit<Chunk, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID()
    await this.db.run(
      'INSERT INTO chunks (id, novel_id, job_id, chunk_index, content_path, start_position, end_position, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        chunk.novelId,
        chunk.jobId,
        chunk.chunkIndex,
        chunk.contentPath,
        chunk.startPosition,
        chunk.endPosition,
        chunk.wordCount || null,
      ],
    )
    return id
  }

  async getChunksByJobId(jobId: string): Promise<Chunk[]> {
    const results = await this.db.all(
      'SELECT * FROM chunks WHERE job_id = ? ORDER BY chunk_index',
      [jobId],
    )

    return results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      novelId: row.novel_id as string,
      jobId: row.job_id as string,
      chunkIndex: row.chunk_index as number,
      contentPath: row.content_path as string,
      startPosition: row.start_position as number,
      endPosition: row.end_position as number,
      wordCount: row.word_count as number | undefined,
      createdAt: new Date(row.created_at as string),
    }))
  }

  // Episode関連メソッド
  async createEpisode(episode: Episode): Promise<void> {
    const id = `${episode.jobId}-ep${episode.episodeNumber}`
    await this.db.run(
      `INSERT INTO episodes (
        id, novel_id, job_id, episode_number, title, summary,
        start_chunk, start_char_index, end_chunk, end_char_index,
        estimated_pages, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        episode.novelId,
        episode.jobId,
        episode.episodeNumber,
        episode.title || null,
        episode.summary || null,
        episode.startChunk,
        episode.startCharIndex,
        episode.endChunk,
        episode.endCharIndex,
        episode.estimatedPages,
        episode.confidence,
      ],
    )
  }

  async createEpisodes(episodes: Episode[]): Promise<void> {
    // トランザクション的な処理
    const statements = episodes.map((episode) => {
      const id = `${episode.jobId}-ep${episode.episodeNumber}`
      return {
        query: `INSERT INTO episodes (
          id, novel_id, job_id, episode_number, title, summary,
          start_chunk, start_char_index, end_chunk, end_char_index,
          estimated_pages, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          episode.novelId,
          episode.jobId,
          episode.episodeNumber,
          episode.title || null,
          episode.summary || null,
          episode.startChunk,
          episode.startCharIndex,
          episode.endChunk,
          episode.endCharIndex,
          episode.estimatedPages,
          episode.confidence,
        ],
      }
    })

    await this.db.batch(statements)
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    const results = await this.db.all(
      'SELECT * FROM episodes WHERE job_id = ? ORDER BY episode_number',
      [jobId],
    )

    return results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      novelId: row.novel_id as string,
      jobId: row.job_id as string,
      episodeNumber: row.episode_number as number,
      title: row.title as string | undefined,
      summary: row.summary as string | undefined,
      startChunk: row.start_chunk as number,
      startCharIndex: row.start_char_index as number,
      endChunk: row.end_chunk as number,
      endCharIndex: row.end_char_index as number,
      estimatedPages: row.estimated_pages as number,
      confidence: row.confidence as number,
      createdAt: new Date(row.created_at as string),
    }))
  }
}
