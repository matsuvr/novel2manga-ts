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

  // Create a job (id optional)
  async create(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string> {
    return this.db.createJob(payload)
  }

  async getByNovelId(novelId: string): Promise<Job[]> {
    return this.db.getJobsByNovelId(novelId)
  }
}
