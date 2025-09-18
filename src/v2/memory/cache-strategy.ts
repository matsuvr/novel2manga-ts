import { type MemoryConfig, memoryConfig } from '@/config/memory.config'
import type {
  CacheDecision,
  CacheLevel,
  CacheMetrics,
  CharacterUsageStats,
  CharId,
  CompressionLevel,
} from './types'

interface UsageProfile {
  readonly id: CharId
  accessCount: number
  lastAccessChunk: number
  lastAccessAt: number
  totalGap: number
  importance: number
}

interface CacheStrategyMetrics extends CacheMetrics {
  readonly hits: Record<CacheLevel, number>
  readonly misses: Record<'hot' | 'warm' | 'cold', number>
  readonly promotions: Record<'hot' | 'warm', number>
  readonly demotions: Record<'hot' | 'warm', number>
  readonly evictions: Record<'hot' | 'warm', number>
}

function createEmptyMetrics(): CacheStrategyMetrics {
  return {
    hits: {
      hot: 0,
      warm: 0,
      cold: 0,
    },
    misses: {
      hot: 0,
      warm: 0,
      cold: 0,
    },
    promotions: {
      hot: 0,
      warm: 0,
    },
    demotions: {
      hot: 0,
      warm: 0,
    },
    evictions: {
      hot: 0,
      warm: 0,
    },
  }
}

export class CacheStrategy {
  private readonly usageProfiles = new Map<CharId, UsageProfile>()
  private readonly metrics: CacheStrategyMetrics = createEmptyMetrics()

  constructor(private readonly config: MemoryConfig = memoryConfig) {}

  registerAccess(id: CharId, chunkIndex: number, timestamp = Date.now()): CacheDecision {
    const profile = this.ensureProfile(id)
    const gap = profile.accessCount === 0 ? 0 : Math.max(1, chunkIndex - profile.lastAccessChunk)
    profile.totalGap += gap
    profile.lastAccessChunk = chunkIndex
    profile.accessCount += 1
    profile.lastAccessAt = timestamp

    const score = this.computePriorityScore(profile)
    const compression = this.computeCompression(score, profile)
    const usage: CharacterUsageStats = {
      accessCount: profile.accessCount,
      averageAccessGap: profile.accessCount === 0 ? gap : profile.totalGap / profile.accessCount,
      lastAccessAt: profile.lastAccessAt,
      lastAccessChunk: profile.lastAccessChunk,
      importance: profile.importance,
    }

    const targetLevel = this.pickTargetLevel(score, gap)

    return {
      id,
      targetLevel,
      compression,
      usage,
    }
  }

  ensureUsage(id: CharId, fallbackChunk: number, importance = this.config.prediction.defaultImportance): CharacterUsageStats {
    const profile = this.ensureProfile(id)
    if (profile.accessCount === 0) {
      profile.lastAccessChunk = fallbackChunk
      profile.importance = importance
    }

    return {
      accessCount: profile.accessCount,
      averageAccessGap: profile.accessCount > 0 ? profile.totalGap / profile.accessCount : fallbackChunk,
      lastAccessAt: profile.lastAccessAt,
      lastAccessChunk: profile.lastAccessChunk,
      importance: profile.importance,
    }
  }

  recordHit(level: CacheLevel): void {
    this.metrics.hits[level] += 1
  }

  recordMiss(level: CacheLevel): void {
    this.metrics.misses[level] += 1
  }

  recordPromotion(level: Exclude<CacheLevel, 'cold'>): void {
    this.metrics.promotions[level] += 1
  }

  recordDemotion(level: Exclude<CacheLevel, 'cold'>): void {
    this.metrics.demotions[level] += 1
  }

  recordEviction(level: Exclude<CacheLevel, 'cold'>): void {
    this.metrics.evictions[level] += 1
  }

  getMetrics(): CacheMetrics {
    return {
      hits: { ...this.metrics.hits },
      misses: { ...this.metrics.misses },
      promotions: { ...this.metrics.promotions },
      demotions: { ...this.metrics.demotions },
      evictions: { ...this.metrics.evictions },
    }
  }

  getHitRate(): number {
    const hits = this.metrics.hits.hot + this.metrics.hits.warm
    const misses = this.metrics.misses.hot + this.metrics.misses.warm
    if (hits + misses === 0) {
      return 0
    }
    return hits / (hits + misses)
  }

  updateImportance(id: CharId, importance: number): void {
    const profile = this.ensureProfile(id)
    profile.importance = importance
  }

  getUsage(id: CharId): CharacterUsageStats | undefined {
    const profile = this.usageProfiles.get(id)
    if (!profile) {
      return undefined
    }
    return {
      accessCount: profile.accessCount,
      averageAccessGap: profile.accessCount > 0 ? profile.totalGap / profile.accessCount : profile.totalGap,
      lastAccessAt: profile.lastAccessAt,
      lastAccessChunk: profile.lastAccessChunk,
      importance: profile.importance,
    }
  }

  private computePriorityScore(profile: UsageProfile): number {
    const recencyScore = this.computeRecencyScore(profile)
    const frequencyScore = Math.min(1, profile.accessCount / this.config.scoring.frequencyNormalization)
    const importanceScore = Math.min(1, profile.importance)

    const score =
      this.config.scoring.baseScore +
      recencyScore * this.config.scoring.recencyWeight +
      frequencyScore * this.config.scoring.frequencyWeight +
      importanceScore * this.config.scoring.importanceWeight

    return Math.min(1, score)
  }

  private computeRecencyScore(profile: UsageProfile): number {
    if (profile.accessCount === 0) {
      return 0
    }

    const gap = Math.max(1, profile.totalGap / profile.accessCount)
    const halfLife = this.config.prediction.recencyHalfLifeChunks
    const decay = 0.5 ** (gap / halfLife)
    return Math.min(1, decay)
  }

  private computeCompression(score: number, profile: UsageProfile): CompressionLevel {
    if (score >= this.config.hot.promotionScoreThreshold) {
      return 'none'
    }

    if (profile.importance >= this.config.compression.lightRetentionImportance) {
      return 'light'
    }

    if (score <= this.config.compression.heavyCompressionThreshold / 2) {
      return 'heavy'
    }

    return 'light'
  }

  private pickTargetLevel(score: number, gap: number): CacheLevel {
    if (score >= this.config.hot.promotionScoreThreshold) {
      return 'hot'
    }

    if (score >= this.config.warm.retentionScoreThreshold) {
      return 'warm'
    }

    if (gap > this.config.warm.demotionGraceChunks) {
      return 'cold'
    }

    return 'warm'
  }

  private ensureProfile(id: CharId): UsageProfile {
    let profile = this.usageProfiles.get(id)
    if (!profile) {
      profile = {
        id,
        accessCount: 0,
        lastAccessAt: Date.now(),
        lastAccessChunk: 0,
        totalGap: 0,
        importance: this.config.prediction.defaultImportance,
      }
      this.usageProfiles.set(id, profile)
    }
    return profile
  }
}
