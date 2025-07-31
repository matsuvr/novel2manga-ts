import type { D1Database } from '@cloudflare/workers-types';
import type { Job, Chunk, ExtendedJob, JobProgress, Episode, JobStatus } from '@/types';

export class DatabaseService {
  constructor(private db: D1Database) {}

  async createJob(id: string, originalText: string, chunkCount: number): Promise<void> {
    await this.db.prepare(
      'INSERT INTO jobs (id, original_text, chunk_count, status) VALUES (?, ?, ?, ?)'
    ).bind(id, originalText, chunkCount, 'pending').run();
  }

  async createChunk(chunk: Omit<Chunk, 'createdAt'>): Promise<void> {
    await this.db.prepare(
      'INSERT INTO chunks (id, job_id, chunk_index, content, file_name) VALUES (?, ?, ?, ?, ?)'
    ).bind(chunk.id, chunk.jobId, chunk.chunkIndex, chunk.content, chunk.fileName).run();
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.db.prepare(
      'SELECT id, original_text as originalText, chunk_count as chunkCount, created_at as createdAt, updated_at as updatedAt FROM jobs WHERE id = ?'
    ).bind(id).first<Job>();
    
    return result || null;
  }

  async getChunksByJobId(jobId: string): Promise<Chunk[]> {
    const result = await this.db.prepare(
      'SELECT id, job_id as jobId, chunk_index as chunkIndex, content, file_name as fileName, created_at as createdAt FROM chunks WHERE job_id = ? ORDER BY chunk_index'
    ).bind(jobId).all<Chunk>();
    
    return result.results || [];
  }

  async getExtendedJob(id: string): Promise<ExtendedJob | null> {
    const result = await this.db.prepare(
      `SELECT 
        id, 
        original_text as originalText, 
        chunk_count as chunkCount, 
        status,
        progress,
        error_message as errorMessage,
        processed_chunks as processedChunks,
        total_episodes as totalEpisodes,
        created_at as createdAt, 
        updated_at as updatedAt 
      FROM jobs 
      WHERE id = ?`
    ).bind(id).first<ExtendedJob>();
    
    if (result && result.progress) {
      result.progress = JSON.parse(result.progress as unknown as string);
    }
    
    return result || null;
  }

  async updateJobStatus(id: string, status: JobStatus, errorMessage?: string): Promise<void> {
    const query = errorMessage 
      ? 'UPDATE jobs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      : 'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    const params = errorMessage ? [status, errorMessage, id] : [status, id];
    await this.db.prepare(query).bind(...params).run();
  }

  async updateJobProgress(id: string, progress: JobProgress): Promise<void> {
    await this.db.prepare(
      `UPDATE jobs 
       SET progress = ?, 
           processed_chunks = ?, 
           total_episodes = ?,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    ).bind(
      JSON.stringify(progress), 
      progress.processedChunks,
      progress.episodes.length,
      id
    ).run();
  }

  async createEpisode(episode: Episode): Promise<void> {
    const id = `${episode.jobId}-ep${episode.episodeNumber}`;
    await this.db.prepare(
      `INSERT INTO episodes (
        id, job_id, episode_number, title, summary,
        start_chunk, start_char_index, end_chunk, end_char_index,
        estimated_pages, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      episode.jobId,
      episode.episodeNumber,
      episode.title || null,
      episode.summary || null,
      episode.startChunk,
      episode.startCharIndex,
      episode.endChunk,
      episode.endCharIndex,
      episode.estimatedPages,
      episode.confidence
    ).run();
  }

  async createEpisodes(episodes: Episode[]): Promise<void> {
    // トランザクション的な処理
    const statements = episodes.map(episode => {
      const id = `${episode.jobId}-ep${episode.episodeNumber}`;
      return this.db.prepare(
        `INSERT INTO episodes (
          id, job_id, episode_number, title, summary,
          start_chunk, start_char_index, end_chunk, end_char_index,
          estimated_pages, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        episode.jobId,
        episode.episodeNumber,
        episode.title || null,
        episode.summary || null,
        episode.startChunk,
        episode.startCharIndex,
        episode.endChunk,
        episode.endCharIndex,
        episode.estimatedPages,
        episode.confidence
      );
    });

    await this.db.batch(statements);
  }

  async getEpisodesByJobId(jobId: string): Promise<Episode[]> {
    const result = await this.db.prepare(
      `SELECT 
        id,
        job_id as jobId,
        episode_number as episodeNumber,
        title,
        summary,
        start_chunk as startChunk,
        start_char_index as startCharIndex,
        end_chunk as endChunk,
        end_char_index as endCharIndex,
        estimated_pages as estimatedPages,
        confidence,
        created_at as createdAt
      FROM episodes 
      WHERE job_id = ?
      ORDER BY episode_number`
    ).bind(jobId).all<Episode>();
    
    return result.results || [];
  }
}