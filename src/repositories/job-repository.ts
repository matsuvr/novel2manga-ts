import type { Job } from "@/db";

export interface JobDbPort {
  getJob(id: string): Promise<Job | null>;
  getJobWithProgress(
    id: string
  ): Promise<(Job & { progress: unknown | null }) | null>;
  // Create job (two supported call signatures, matching DatabaseService)
  createJob(id: string, novelId: string, jobName?: string): Promise<string>;
  createJob(payload: {
    novelId: string;
    title?: string;
    totalChunks?: number;
    status?: string;
  }): Promise<string>;
  // List jobs for a novel
  getJobsByNovelId(novelId: string): Promise<Job[]>;
}

export class JobRepository {
  constructor(private readonly db: JobDbPort) {}

  async getJob(id: string) {
    return this.db.getJob(id);
  }

  async getJobWithProgress(id: string) {
    return this.db.getJobWithProgress(id);
  }

  // Create a job with auto-generated id by DB layer
  async create(payload: {
    novelId: string;
    title?: string;
    totalChunks?: number;
    status?: string;
  }): Promise<string> {
    return this.db.createJob(payload);
  }

  // Create a job with provided id
  async createWithId(
    id: string,
    novelId: string,
    jobName?: string
  ): Promise<string> {
    return this.db.createJob(id, novelId, jobName);
  }

  async getByNovelId(novelId: string): Promise<Job[]> {
    return this.db.getJobsByNovelId(novelId);
  }
}
