import type { Episode, Job, NewEpisode, NewNovel, NewOutput, Novel } from '@/db'

/**
 * Standardized port interfaces using discriminated unions for method categorization.
 * This ensures clear separation between required and optional capabilities.
 *
 * Design principles:
 * - Read operations are always required
 * - Write operations may be optional (for read-only adapters)
 * - Each port clearly declares its capabilities through discriminated unions
 */

// === Episode Port ===

/** Required read operations for Episode */
export interface EpisodeReadCapabilities {
  readonly type: 'episode-read'
  getEpisodesByJobId(jobId: string): Promise<Episode[]>
}

/** Optional write operations for Episode */
export interface EpisodeWriteCapabilities {
  readonly type: 'episode-write'
  createEpisodes(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void>
}

/** Complete Episode port with discriminated capabilities */
export type EpisodeDbPort = EpisodeReadCapabilities & Partial<EpisodeWriteCapabilities>

// === Job Port ===

/** Required read operations for Job */
export interface JobReadCapabilities {
  readonly type: 'job-read'
  getJob(id: string): Promise<Job | null>
  getJobWithProgress(id: string): Promise<(Job & { progress: unknown | null }) | null>
  getJobsByNovelId(novelId: string): Promise<Job[]>
}

/** Required write operations for Job */
export interface JobWriteCapabilities {
  readonly type: 'job-write'
  // Overloaded method signatures for flexibility
  createJob(id: string, novelId: string, jobName?: string): Promise<string>
  createJob(payload: {
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string>
}

/** Complete Job port with all required capabilities */
export type JobDbPort = JobReadCapabilities & JobWriteCapabilities

// === Novel Port ===

/** Required read operations for Novel */
export interface NovelReadCapabilities {
  readonly type: 'novel-read'
  getNovel(id: string): Promise<Novel | null>
  getAllNovels(): Promise<Novel[]>
}

/** Required write operations for Novel */
export interface NovelWriteCapabilities {
  readonly type: 'novel-write'
  ensureNovel(id: string, payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>
}

/** Complete Novel port with all required capabilities */
export type NovelDbPort = NovelReadCapabilities & NovelWriteCapabilities

// === Output Port ===

/** Required write operations for Output (no read operations defined) */
export interface OutputWriteCapabilities {
  readonly type: 'output-write'
  createOutput(payload: Omit<NewOutput, 'createdAt'>): Promise<string>
}

/** Complete Output port (write-only) */
export type OutputDbPort = OutputWriteCapabilities

// === Type Guards ===

/** Check if a port has Episode write capabilities */
export function hasEpisodeWriteCapabilities(
  port: EpisodeDbPort,
): port is EpisodeReadCapabilities & EpisodeWriteCapabilities {
  return 'createEpisodes' in port && typeof port.createEpisodes === 'function'
}

/** Check if a port has Job write capabilities (always true for JobDbPort) */
export function hasJobWriteCapabilities(
  port: JobDbPort,
): port is JobReadCapabilities & JobWriteCapabilities {
  return 'createJob' in port && typeof port.createJob === 'function'
}

/** Check if a port has Novel write capabilities (always true for NovelDbPort) */
export function hasNovelWriteCapabilities(
  port: NovelDbPort,
): port is NovelReadCapabilities & NovelWriteCapabilities {
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
