// Repository classes

export { ChunkRepository } from './chunk-repository'
export { EpisodeRepository } from './episode-repository'
// Repository Factory
export {
  getChunkRepository,
  getEpisodeRepository,
  getJobRepository,
  getNovelRepository,
  getOutputRepository,
  getRepositoryFactory,
  RepositoryFactory,
} from './factory'
export { JobRepository } from './job-repository'
export { NovelRepository } from './novel-repository'
export { OutputRepository } from './output-repository'
// Port interfaces (standardized)
export type {
  EpisodeDbPort,
  JobDbPort,
  NovelDbPort,
  OutputDbPort,
  PartialUnifiedDbPort,
  PortConfiguration,
  PortFactory,
  UnifiedDbPort,
} from './ports'
// Type guards
export {
  hasEpisodeWriteCapabilities,
  hasJobWriteCapabilities,
  hasNovelWriteCapabilities,
} from './ports'
