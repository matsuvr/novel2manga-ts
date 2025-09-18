import type { MemoryConfig } from '@/config/memory.config'
import type { CharacterRecord } from '@/v2/registry'

export type CharId = `char_${string}`
export type CacheLevel = 'hot' | 'warm' | 'cold'
export type CacheRequestLevel = CacheLevel | 'auto'
export type CompressionLevel = 'none' | 'light' | 'heavy'

export interface CharacterLegend {
  readonly id: CharId
  readonly name: string
  readonly voice: string
  readonly summary?: string
}

export interface WarmCharacterPayload {
  readonly id: CharId
  readonly name: string
  readonly essence: string
  readonly lastSeenChunk: number
  readonly importance: number
}

export interface CharacterUsageStats {
  readonly accessCount: number
  readonly lastAccessChunk: number
  readonly lastAccessAt: number
  readonly averageAccessGap: number
  readonly importance: number
}

export interface HotCharacterData {
  readonly kind: 'full'
  readonly record: CharacterRecord
  readonly legend: CharacterLegend
  readonly usage: CharacterUsageStats
  readonly estimatedTokens: number
}

export interface WarmCharacterData {
  readonly kind: 'compressed'
  readonly compressed: WarmCharacterPayload
  readonly usage: CharacterUsageStats
  readonly estimatedTokens: number
}

export type CharacterData = HotCharacterData | WarmCharacterData
export type FullCharacterData = HotCharacterData
export type CompressedData = WarmCharacterData

export interface CacheDecision {
  readonly id: CharId
  readonly targetLevel: CacheLevel
  readonly compression: CompressionLevel
  readonly usage: CharacterUsageStats
}

export interface CacheMetrics {
  readonly hits: Record<CacheLevel, number>
  readonly misses: Record<Exclude<CacheLevel, 'cold'> | 'cold', number>
  readonly promotions: Record<Exclude<CacheLevel, 'cold'>, number>
  readonly demotions: Record<Exclude<CacheLevel, 'cold'>, number>
  readonly evictions: Record<Exclude<CacheLevel, 'cold'>, number>
}

export interface MemoryStatistics {
  readonly hotEntries: number
  readonly warmEntries: number
  readonly hotBytes: number
  readonly warmBytes: number
  readonly totalBytes: number
  readonly configuredLimitBytes: number
  readonly reductionRatio: number
  readonly hitRate: number
}

export interface HierarchicalMemoryManagerOptions {
  readonly config?: MemoryConfig
}

export interface CacheStatusSnapshot {
  readonly level: CacheLevel
  readonly entryCount: number
  readonly totalBytes: number
}
