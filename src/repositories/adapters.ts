import type { DatabaseService } from '@/services/database'
import type {
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
  }
}

export function adaptAll(db: DatabaseService) {
  return {
    episode: adaptEpisodePort(db, true),
    job: adaptJobPort(db),
    novel: adaptNovelPort(db, true),
    output: adaptOutputPort(db),
  }
}
