import type { Episode, Job, NewEpisode, NewNovel, NewOutput, Novel } from '@/db'

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
  getJobWithProgress(id: string): Promise<(Job & { progress: unknown | null }) | null>
  getJobsByNovelId(novelId: string): Promise<Job[]>
  createJob(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string>
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
}

// === Type Guards ===

/** Check if a port has Episode write capabilities */
export function hasEpisodeWriteCapabilities(port: EpisodeDbPort): port is EpisodeDbPortRW {
  // 後方互換: mode 判定が無くても createEpisodes があれば write とみなす
  return (
    (port as any).mode === 'rw' ||
    ('createEpisodes' in (port as any) && typeof (port as any).createEpisodes === 'function')
  )
}

/** Check if a port has Job write capabilities (always true for JobDbPort) */
export function hasJobWriteCapabilities(port: JobDbPort): port is JobDbPort {
  return port.mode === 'rw'
}

/** Check if a port has Novel write capabilities (always true for NovelDbPort) */
export function hasNovelWriteCapabilities(port: NovelDbPort): port is NovelDbPortRW {
  // 後方互換: mode 判定が無くても ensureNovel があれば write とみなす
  return (
    (port as any).mode === 'rw' ||
    ('ensureNovel' in (port as any) && typeof (port as any).ensureNovel === 'function')
  )
}

// === Unified Port Type ===

/** Combined database port with all entity capabilities (RW を付与) */
// 複数 entity を束ねる場合 discriminant 'entity' が衝突するため Omit で除去し統合
export type UnifiedDbPort = Omit<EpisodeDbPortRW, 'entity'> &
  Omit<JobDbPort, 'entity'> &
  Omit<NovelDbPortRW, 'entity'> &
  Omit<OutputDbPort, 'entity'> & {
    entities: Array<
      EpisodeDbPort['entity'] | JobDbPort['entity'] | NovelDbPort['entity'] | OutputDbPort['entity']
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

// Runtime type guards for discriminated union narrowing (defensive checks)
export const isEpisodePort = (p: unknown): p is EpisodeDbPort =>
  !!p && typeof p === 'object' && (p as any).entity === 'episode'
export const isNovelPort = (p: unknown): p is NovelDbPort =>
  !!p && typeof p === 'object' && (p as any).entity === 'novel'
export const isJobPort = (p: unknown): p is JobDbPort =>
  !!p && typeof p === 'object' && (p as any).entity === 'job'
export const isOutputPort = (p: unknown): p is OutputDbPort =>
  !!p && typeof p === 'object' && (p as any).entity === 'output'
