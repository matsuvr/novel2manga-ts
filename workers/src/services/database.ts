import type { D1Database } from '@cloudflare/workers-types';
import type { Job, Chunk } from '../types';

export class DatabaseService {
  constructor(private db: D1Database) {}

  async createJob(id: string, originalText: string, chunkCount: number): Promise<void> {
    await this.db.prepare(
      'INSERT INTO jobs (id, original_text, chunk_count) VALUES (?, ?, ?)'
    ).bind(id, originalText, chunkCount).run();
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
}