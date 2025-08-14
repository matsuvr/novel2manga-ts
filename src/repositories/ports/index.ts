import type { Episode, Job, NewEpisode, NewNovel, NewOutput, Novel } from '@/db'
import type { JobProgress, JobStatus } from '@/types/job'

/**
 * Repository Port Layer (標準化版)
 *
 * 目的:
 *  - 必須/任意メソッドを discriminated union で明確化し静的解析精度を向上
 *  - read-only 実装と read-write 実装を安全に区別
 *  - 既存実装互換性: 旧シグネチャ(メソッドのみ)もアダプタ経由で充足
 */

/**
 * Standardized port interfaces for repository pattern.
 * Defines clear contracts between repositories and their data access implementations.
 *
 * Design principles:
 * - Each port focuses on a single entity's operations
 * - Optional methods support read-only implementations
 * - Clear separation between required and optional capabilities
 */

// === Job Step Types (strongly-typed progress states) ===
export type BaseJobStep =
  | 'initialized'
  | 'split'
  | 'analyze'
  | 'episode'
  | 'layout'
  | 'render'
  | 'complete'

export type AnalyzeChunkStep =
  | `analyze_chunk_${number}`
  | `analyze_chunk_${number}_retry`
  | `analyze_chunk_${number}_done`

export type LayoutEpisodeStep = `layout_episode_${number}`

export type JobStep = BaseJobStep | AnalyzeChunkStep | LayoutEpisodeStep

// === Episode Port (RO / RW) ===

/** 読み取り専用 Episode ポート */
export interface EpisodeDbPortRO {
  entity: 'episode'
  mode: 'ro'
  getEpisodesByJobId(jobId: string): Promise<Episode[]>
}

/** 読み書き Episode ポート */
export interface EpisodeDbPortRW extends Omit<EpisodeDbPortRO, 'mode'> {
  mode: 'rw'
  createEpisodes(episodes: Array<Omit<NewEpisode, 'id' | 'createdAt'>>): Promise<void>
}

export type EpisodeDbPort = EpisodeDbPortRO | EpisodeDbPortRW

// === Job Port (Job は常に書き込み想定: 個別RO実装ニーズ低と判断) ===

export interface JobDbPort {
  entity: 'job'
  mode: 'rw'
  getJob(id: string): Promise<Job | null>
  getJobWithProgress(id: string): Promise<(Job & { progress: JobProgress | null }) | null>
  getJobsByNovelId(novelId: string): Promise<Job[]>
  createJob(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string>
  /** Update job status (and optionally error reason) */
  updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void>
  /** Update job step/progress counters */
  updateJobStep(
    id: string,
    currentStep: JobStep,
    processedChunks?: number,
    totalChunks?: number,
    error?: string,
    errorStep?: string,
  ): Promise<void>
  /** Mark a specific pipeline step completed */
  markJobStepCompleted(
    id: string,
    stepType: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
  ): Promise<void>
  /** Update consolidated job progress model */
  updateJobProgress(id: string, progress: JobProgress): Promise<void>
  /** Set lastError and optionally increment retry */
  updateJobError(id: string, error: string, step: string, incrementRetry?: boolean): Promise<void>
}

// === Novel Port (RO / RW: ensureNovel が書込) ===

export interface NovelDbPortRO {
  entity: 'novel'
  mode: 'ro'
  getNovel(id: string): Promise<Novel | null>
  getAllNovels(): Promise<Novel[]>
}
export interface NovelDbPortRW extends Omit<NovelDbPortRO, 'mode'> {
  mode: 'rw'
  ensureNovel(id: string, payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>
}
export type NovelDbPort = NovelDbPortRO | NovelDbPortRW

// === Output Port (書込のみ / 単機能) ===
export interface OutputDbPort {
  entity: 'output'
  mode: 'rw'
  createOutput(payload: Omit<NewOutput, 'createdAt'>): Promise<string>
  getOutput(id: string): Promise<NewOutput | null>
}

// === Chunk Port (書込 + 参照最小限) ===
export interface ChunkDbPort {
  entity: 'chunk'
  mode: 'rw'
  createChunk(payload: {
    novelId: string
    jobId: string
    chunkIndex: number
    contentPath: string
    startPosition: number
    endPosition: number
    wordCount?: number | null
  }): Promise<string>
  createChunksBatch(
    payload: Array<{
      novelId: string
      jobId: string
      chunkIndex: number
      contentPath: string
      startPosition: number
      endPosition: number
      wordCount?: number | null
    }>,
  ): Promise<void>
}

// === Type Guards ===

/** Check if a port has Episode write capabilities */
export function hasEpisodeWriteCapabilities(port: EpisodeDbPort): port is EpisodeDbPortRW {
  // 後方互換: mode 判定が無くても createEpisodes があれば write とみなす
  const candidate: unknown = port as unknown
  if (!candidate || typeof candidate !== 'object') return false
  const obj = candidate as { mode?: unknown; createEpisodes?: unknown }
  return obj.mode === 'rw' || typeof obj.createEpisodes === 'function'
}

/** Check if a port has Job write capabilities (always true for JobDbPort) */
export function hasJobWriteCapabilities(port: JobDbPort): port is JobDbPort {
  return port.mode === 'rw'
}

/** Check if a port has Novel write capabilities (always true for NovelDbPort) */
export function hasNovelWriteCapabilities(port: NovelDbPort): port is NovelDbPortRW {
  // 後方互換: mode 判定が無くても ensureNovel があれば write とみなす
  const candidate: unknown = port as unknown
  if (!candidate || typeof candidate !== 'object') return false
  const obj = candidate as { mode?: unknown; ensureNovel?: unknown }
  return obj.mode === 'rw' || typeof obj.ensureNovel === 'function'
}

// === Unified Port Type ===

/** Combined database port with all entity capabilities (RW を付与) */
// 複数 entity を束ねる場合 discriminant 'entity' が衝突するため Omit で除去し統合
export type UnifiedDbPort = Omit<EpisodeDbPortRW, 'entity'> &
  Omit<JobDbPort, 'entity'> &
  Omit<NovelDbPortRW, 'entity'> &
  Omit<OutputDbPort, 'entity'> &
  Omit<ChunkDbPort, 'entity'> & {
    entities: Array<
      | EpisodeDbPort['entity']
      | JobDbPort['entity']
      | NovelDbPort['entity']
      | OutputDbPort['entity']
      | ChunkDbPort['entity']
    >
  }

export type PartialUnifiedDbPort = Partial<UnifiedDbPort>

// === Port Factory Types ===

/** Configuration for creating ports with specific capabilities */
export interface PortConfiguration {
  readonly: boolean
  entities: Array<'episode' | 'job' | 'novel' | 'output'>
}

/** Factory method signature for creating ports */
export type PortFactory<T extends Partial<UnifiedDbPort>> = (config: PortConfiguration) => T

// === Transaction / Unit of Work Ports ===

export interface TransactionPort {
  withTransaction<T>(fn: () => Promise<T>): Promise<T>
}

export interface UnitOfWorkPort {
  begin(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}

// Runtime type guards for discriminated union narrowing (defensive checks)
export const isEpisodePort = (p: unknown): p is EpisodeDbPort => {
  if (!p || typeof p !== 'object') return false
  const obj = p as { entity?: unknown }
  return obj.entity === 'episode'
}
export const isNovelPort = (p: unknown): p is NovelDbPort => {
  if (!p || typeof p !== 'object') return false
  const obj = p as { entity?: unknown }
  return obj.entity === 'novel'
}
export const isJobPort = (p: unknown): p is JobDbPort => {
  if (!p || typeof p !== 'object') return false
  const obj = p as { entity?: unknown }
  return obj.entity === 'job'
}
export const isOutputPort = (p: unknown): p is OutputDbPort => {
  if (!p || typeof p !== 'object') return false
  const obj = p as { entity?: unknown }
  return obj.entity === 'output'
}
