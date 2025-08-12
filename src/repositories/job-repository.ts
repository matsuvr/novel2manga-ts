import type { Job } from '@/db'
import type { JobDbPort } from './ports'

// Re-export for backward compatibility
export type { JobDbPort } from './ports'

export class JobRepository {
  constructor(private readonly db: JobDbPort) {}

  async getJob(id: string) {
    return this.db.getJob(id)
  }

  async getJobWithProgress(id: string) {
    return this.db.getJobWithProgress(id)
  }

  // Create a job with auto-generated id by DB layer
  async create(payload: {
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string> {
    return this.db.createJob(payload)
  }

  // Create a job with provided id
  async createWithId(id: string, novelId: string, jobName?: string): Promise<string> {
    return this.db.createJob(id, novelId, jobName)
  }

  async getByNovelId(novelId: string): Promise<Job[]> {
    return this.db.getJobsByNovelId(novelId)
  }
}
