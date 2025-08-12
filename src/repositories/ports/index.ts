import type { Episode, Job, NewEpisode, NewNovel, NewOutput, Novel } from '@/db'

/**
 * Standardized port interfaces for repository pattern.
 * Defines clear contracts between repositories and their data access implementations.
 *
 * Design principles:
 * - Each port focuses on a single entity's operations
 * - Optional methods support read-only implementations
 * - Clear separation between required and optional capabilities
 */

// === Episode Port ===

/** Database port for Episode entity */
export interface EpisodeDbPort {
  /** Fetch all episodes for a job (ordered by episodeNumber ascending) */
  getEpisodesByJobId(jobId: string): Promise<Episode[]>
  /**
   * Bulk create or upsert episodes. Optional to support read-only adapters.
   * Implementations should upsert on (jobId, episodeNumber).
   */
  createEpisodes?(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void>
}

// === Job Port ===

/** Database port for Job entity */
export interface JobDbPort {
  getJob(id: string): Promise<Job | null>
  getJobWithProgress(id: string): Promise<(Job & { progress: unknown | null }) | null>
  getJobsByNovelId(novelId: string): Promise<Job[]>
  /**
   * Create a job.
   * - If id is provided uses that id (useful for external correlation / deterministic ids in tests)
   * - Otherwise generates a new id
   */
  createJob(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string>
}

// === Novel Port ===

/** Database port for Novel entity */
export interface NovelDbPort {
  getNovel(id: string): Promise<Novel | null>
  getAllNovels(): Promise<Novel[]>
  ensureNovel(id: string, payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>
}

// === Output Port ===

/** Database port for Output entity */
export interface OutputDbPort {
  createOutput(payload: Omit<NewOutput, 'createdAt'>): Promise<string>
}

// === Type Guards ===

/** Check if a port has Episode write capabilities */
export function hasEpisodeWriteCapabilities(
  port: EpisodeDbPort,
): port is EpisodeDbPort & Required<Pick<EpisodeDbPort, 'createEpisodes'>> {
  return 'createEpisodes' in port && typeof port.createEpisodes === 'function'
}

/** Check if a port has Job write capabilities (always true for JobDbPort) */
export function hasJobWriteCapabilities(port: JobDbPort): port is JobDbPort {
  return 'createJob' in port && typeof port.createJob === 'function'
}

/** Check if a port has Novel write capabilities (always true for NovelDbPort) */
export function hasNovelWriteCapabilities(port: NovelDbPort): port is NovelDbPort {
  return 'ensureNovel' in port && typeof port.ensureNovel === 'function'
}

// === Unified Port Type ===

/** Combined database port with all entity capabilities */
export interface UnifiedDbPort extends EpisodeDbPort, JobDbPort, NovelDbPort, OutputDbPort {}

/** Partial unified port for testing or limited implementations */
export type PartialUnifiedDbPort = Partial<UnifiedDbPort>

// === Port Factory Types ===

/** Configuration for creating ports with specific capabilities */
export interface PortConfiguration {
  readonly: boolean
  entities: Array<'episode' | 'job' | 'novel' | 'output'>
}

/** Factory method signature for creating ports */
export type PortFactory<T extends Partial<UnifiedDbPort>> = (config: PortConfiguration) => T
