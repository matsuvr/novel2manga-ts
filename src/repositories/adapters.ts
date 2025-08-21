import type { DatabaseService } from '@/services/database'
import type { JobProgress, JobStatus } from '@/types/job'
import type {
  ChunkDbPort,
  EpisodeDbPort,
  EpisodeDbPortRW,
  JobDbPort,
  NovelDbPort,
  NovelDbPortRW,
  OutputDbPort,
} from './ports'

/**
 * DatabaseService を discriminated union ポートに適合させるアダプタ。
 * DatabaseService 側へ entity/mode を直接付与せず段階的移行を可能にする。
 */
export function adaptEpisodePort(db: DatabaseService, writable = true): EpisodeDbPort {
  return writable
    ? ({
        entity: 'episode',
        mode: 'rw',
        getEpisodesByJobId: (jobId) => db.getEpisodesByJobId(jobId),
        createEpisodes: (episodes) => db.createEpisodes(episodes),
      } satisfies EpisodeDbPortRW)
    : ({
        entity: 'episode',
        mode: 'ro',
        getEpisodesByJobId: (jobId) => db.getEpisodesByJobId(jobId),
      } as EpisodeDbPort)
}

export function adaptJobPort(db: DatabaseService): JobDbPort {
  return {
    entity: 'job',
    mode: 'rw',
    getJob: (id) => db.getJob(id),
    getJobWithProgress: (id) => db.getJobWithProgress(id),
    getJobsByNovelId: (novelId) => db.getJobsByNovelId(novelId),
    createJob: (payload) => db.createJob(payload),
    updateJobStatus: (id: string, status: JobStatus, error?: string) =>
      db.updateJobStatus(id, status, error),
    updateJobStep: (
      id: string,
      currentStep,
      processedChunks?: number,
      totalChunks?: number,
      error?: string,
      errorStep?: string,
    ) => db.updateJobStep(id, currentStep, processedChunks, totalChunks, error, errorStep),
    markJobStepCompleted: (id, step) => db.markJobStepCompleted(id, step),
    updateJobProgress: (id, progress: JobProgress) => db.updateJobProgress(id, progress),
    updateJobError: (id, error, step, incrementRetry) =>
      db.updateJobError(id, error, step, incrementRetry),
    updateJobTotalPages: (id, totalPages) => db.updateJobTotalPages(id, totalPages),
  }
}

export function adaptNovelPort(db: DatabaseService, writable = true): NovelDbPort {
  return writable
    ? ({
        entity: 'novel',
        mode: 'rw',
        getNovel: (id) => db.getNovel(id),
        getAllNovels: () => db.getAllNovels(),
        ensureNovel: (id, payload) => db.ensureNovel(id, payload),
      } satisfies NovelDbPortRW)
    : ({
        entity: 'novel',
        mode: 'ro',
        getNovel: (id) => db.getNovel(id),
        getAllNovels: () => db.getAllNovels(),
      } as NovelDbPort)
}

export function adaptOutputPort(db: DatabaseService): OutputDbPort {
  return {
    entity: 'output',
    mode: 'rw',
    createOutput: (payload) => db.createOutput(payload),
    getOutput: (id) => db.getOutput(id),
  }
}

export function adaptAll(db: DatabaseService) {
  return {
    episode: adaptEpisodePort(db, true),
    job: adaptJobPort(db),
    novel: adaptNovelPort(db, true),
    output: adaptOutputPort(db),
    chunk: adaptChunkPort(db),
  }
}

export function adaptChunkPort(db: DatabaseService): ChunkDbPort {
  return {
    entity: 'chunk',
    mode: 'rw',
    createChunk: (payload) => db.createChunk(payload),
    createChunksBatch: async (payloads) => {
      // Fallback: sequential inserts (DatabaseService implements batch natively; tests may mock)
      for (const item of payloads) {
        // eslint-disable-next-line no-await-in-loop
        await db.createChunk(item)
      }
    },
  }
}
