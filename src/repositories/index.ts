// Repository classes
export { EpisodeRepository } from './episode-repository'
// Repository Factory
export {
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
// Port interfaces (standardized with discriminated unions)
export type {
  EpisodeDbPort,
  EpisodeReadCapabilities,
  EpisodeWriteCapabilities,
  JobDbPort,
  JobReadCapabilities,
  JobWriteCapabilities,
  NovelDbPort,
  NovelReadCapabilities,
  NovelWriteCapabilities,
  OutputDbPort,
  OutputWriteCapabilities,
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
