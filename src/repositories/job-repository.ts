import type { Job } from '@/db'

export interface JobDbPort {
  getJob(id: string): Promise<Job | null>
  getJobWithProgress(id: string): Promise<(Job & { progress: unknown | null }) | null>
  // Create job (two supported call signatures, matching DatabaseService)
  createJob(id: string, novelId: string, jobName?: string): Promise<string>
  createJob(payload: {
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string>
  // List jobs for a novel
  getJobsByNovelId(novelId: string): Promise<Job[]>
}

export class JobRepository {
  constructor(private readonly db: JobDbPort) {}

  async getJob(id: string) {
    return this.db.getJob(id)
  }

  async getJobWithProgress(id: string) {
    return this.db.getJobWithProgress(id)
  }

  async create(
    arg1: string | { novelId: string; title?: string; totalChunks?: number; status?: string },
    novelId?: string,
    jobName?: string,
  ): Promise<string> {
    if (typeof arg1 === 'string') {
      if (!novelId) throw new Error('novelId is required')
      return this.db.createJob(arg1, novelId, jobName)
    }
    return this.db.createJob(arg1)
  }

  async getByNovelId(novelId: string): Promise<Job[]> {
    return this.db.getJobsByNovelId(novelId)
  }
}
