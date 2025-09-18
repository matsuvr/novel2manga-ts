import { Buffer } from 'node:buffer'
import { Data, Effect, Option } from 'effect'
import { type MemoryConfig, memoryConfig } from '@/config/memory.config'
import type {
  CharacterRecord,
  RegistryDecodeError,
  RegistryQueryError,
  SQLiteRegistry,
} from '@/v2/registry'
import { CacheStrategy } from './cache-strategy'
import { LRUCache } from './lru-cache'
import type {
  CacheLevel,
  CacheMetrics,
  CacheRequestLevel,
  CharacterData,
  CharacterUsageStats,
  CharId,
  FullCharacterData,
  HierarchicalMemoryManagerOptions,
  MemoryStatistics,
  WarmCharacterData,
} from './types'

export type CharacterRegistryReader = Pick<
  SQLiteRegistry,
  'findCharacterById' | 'getActiveCharacters'
>

export class CharacterNotFoundError extends Data.TaggedError('CharacterNotFoundError')<{
  readonly id: CharId
}> {}

export class MemoryOperationError extends Data.TaggedError('MemoryOperationError')<{
  readonly id: CharId
  readonly cause: unknown
}> {}

interface SearchResult {
  readonly level: CacheLevel
  readonly data: CharacterData
}

const SEARCH_ORDER: Record<CacheRequestLevel, ReadonlyArray<CacheLevel>> = {
  auto: ['hot', 'warm', 'cold'],
  hot: ['hot', 'warm', 'cold'],
  warm: ['hot', 'warm', 'cold'],
  // When requesting `cold` explicitly we should only consult the cold tier
  // so the manager will fall through to loading from the registry instead
  // of returning warmer cached copies.
  cold: ['cold'],
}

export class HierarchicalMemoryManager {
  private readonly config: MemoryConfig
  private readonly hot: LRUCache<CharId, FullCharacterData>
  private readonly warm: LRUCache<CharId, WarmCharacterData>
  private readonly placements = new Map<CharId, CacheLevel>()
  private readonly strategy: CacheStrategy

  constructor(
    private readonly registry: CharacterRegistryReader,
    options: HierarchicalMemoryManagerOptions = {},
  ) {
    this.config = options.config ?? memoryConfig
    this.strategy = new CacheStrategy(this.config)

    this.hot = new LRUCache<CharId, FullCharacterData>({
      level: 'hot',
      maxEntries: this.config.hot.maxEntries,
      maxTotalWeight: this.config.hot.maxTotalSizeBytes,
      maxAgeMs: this.config.hot.maxAgeMs,
      estimateWeight: (value) => this.estimateHotWeight(value),
      onEvict: (id) => {
        this.placements.delete(id)
        this.strategy.recordEviction('hot')
      },
    })

    this.warm = new LRUCache<CharId, WarmCharacterData>({
      level: 'warm',
      maxEntries: this.config.warm.maxEntries,
      maxTotalWeight: this.config.warm.maxTotalSizeBytes,
      maxAgeMs: this.config.warm.maxAgeMs,
      estimateWeight: (value) => this.estimateWarmWeight(value),
      onEvict: (id) => {
        this.placements.delete(id)
        this.strategy.recordEviction('warm')
      },
    })
  }

  getCharacterData(
    id: CharId,
    level: CacheRequestLevel = 'auto',
  ): Effect.Effect<CharacterData, CharacterNotFoundError | MemoryOperationError> {
    const self = this
    return Effect.gen(function* () {
      const searchOrder = SEARCH_ORDER[level] ?? SEARCH_ORDER.auto
      for (const tier of searchOrder) {
        const cached = self.lookupCache(id, tier)
        if (cached) {
          if (tier !== 'cold') {
            self.strategy.recordHit(tier)
          }

          if (level === 'hot' && cached.data.kind !== 'full') {
            const promoted = yield* self.promoteFromWarm(id, cached.data.usage)
            return promoted
          }

          return cached.data
        }

        if (tier !== 'cold') {
          self.strategy.recordMiss(tier)
        }
      }

      const loaded = yield* self.loadFromRegistry(id)
      return loaded
    })
  }

  updateAccessPattern(
    chunkIndex: number,
    accessedIds: ReadonlyArray<CharId>,
  ): Effect.Effect<void, CharacterNotFoundError | MemoryOperationError> {
    const self = this
    return Effect.gen(function* () {
      for (const id of accessedIds) {
        const decision = self.strategy.registerAccess(id, chunkIndex)
        yield* self.applyDecision(decision.targetLevel, id, decision.usage)
      }
    })
  }

  getMemoryStats(): MemoryStatistics {
    const hotSnapshot = this.hot.snapshot()
    const warmSnapshot = this.warm.snapshot()
    const totalBytes = hotSnapshot.totalBytes + warmSnapshot.totalBytes
    const reductionRatio = 1 - totalBytes / this.config.baselineBytes

    return {
      hotEntries: hotSnapshot.entryCount,
      warmEntries: warmSnapshot.entryCount,
      hotBytes: hotSnapshot.totalBytes,
      warmBytes: warmSnapshot.totalBytes,
      totalBytes,
      configuredLimitBytes: this.config.hot.maxTotalSizeBytes + this.config.warm.maxTotalSizeBytes,
      reductionRatio: Number.isFinite(reductionRatio) ? Math.max(0, reductionRatio) : 0,
      hitRate: this.getCacheHitRate(),
    }
  }

  getCacheHitRate(): number {
    return this.strategy.getHitRate()
  }

  getCacheMetrics(): CacheMetrics {
    return this.strategy.getMetrics()
  }

  private lookupCache(id: CharId, level: CacheLevel): SearchResult | undefined {
    if (level === 'hot') {
      const data = this.hot.get(id)
      if (data) {
        this.placements.set(id, 'hot')
        return { level: 'hot', data }
      }
      return undefined
    }

    if (level === 'warm') {
      const data = this.warm.get(id)
      if (data) {
        this.placements.set(id, 'warm')
        return { level: 'warm', data }
      }
      return undefined
    }

    return undefined
  }

  private promoteFromWarm(
    id: CharId,
    usage: CharacterUsageStats,
  ): Effect.Effect<FullCharacterData, CharacterNotFoundError | MemoryOperationError> {
    const self = this
    return Effect.gen(function* () {
      const record = yield* self.fetchRecord(id)
      const importance = self.extractImportance(record)
      self.strategy.updateImportance(id, importance)
      // The warm-tier usage object already contains the latest access
      // statistics. Use it directly but ensure the importance reflects
      // the freshly extracted value from the record.
      const mergedUsage = { ...usage, importance }
      const hotEntry = self.buildHotEntry(record, mergedUsage)
      self.warm.delete(id, { silent: true })
      self.hot.set(id, hotEntry)
      self.placements.set(id, 'hot')
      self.strategy.recordPromotion('hot')
      return hotEntry
    })
  }

  private loadFromRegistry(
    id: CharId,
    usageOverride?: CharacterUsageStats,
  ): Effect.Effect<FullCharacterData, CharacterNotFoundError | MemoryOperationError> {
    const self = this
    return Effect.gen(function* () {
      const record = yield* self.fetchRecord(id)
      const importance = self.extractImportance(record)
      self.strategy.updateImportance(id, importance)
      const usage = usageOverride ?? self.strategy.ensureUsage(id, record.lastSeenChunk, importance)
      const hotEntry = self.buildHotEntry(record, usage)
      self.hot.set(id, hotEntry)
      self.placements.set(id, 'hot')
      self.strategy.recordPromotion('hot')
      return hotEntry
    })
  }

  private applyDecision(
    target: CacheLevel,
    id: CharId,
    usage: CharacterUsageStats,
  ): Effect.Effect<void, CharacterNotFoundError | MemoryOperationError> {
    const self = this
    return Effect.gen(function* () {
      const current = self.placements.get(id)

      if (target === 'hot') {
        const hotEntry = self.hot.get(id)
        if (hotEntry) {
          const refreshed = { ...hotEntry, usage }
          self.hot.set(id, refreshed)
          self.placements.set(id, 'hot')
          return
        }

        const warmEntry = self.warm.get(id)
        if (warmEntry) {
          const promoted = yield* self.promoteFromWarm(id, usage)
          self.hot.set(id, { ...promoted, usage })
          self.placements.set(id, 'hot')
          return
        }

        const loaded = yield* self.loadFromRegistry(id, usage)
        self.hot.set(id, { ...loaded, usage })
        self.placements.set(id, 'hot')
        return
      }

      if (target === 'warm') {
        const warmEntry = self.warm.get(id)
        if (warmEntry) {
          const refreshed = { ...warmEntry, usage }
          self.warm.set(id, refreshed)
          self.placements.set(id, 'warm')
          return
        }

        const hotEntry = self.hot.get(id)
        if (hotEntry) {
          const demoted = self.buildWarmEntry(hotEntry.record, usage)
          self.hot.delete(id, { silent: true })
          self.warm.set(id, demoted)
          self.placements.set(id, 'warm')
          self.strategy.recordDemotion('hot')
          return
        }

        const record = yield* self.fetchRecord(id)
        const importance = self.extractImportance(record)
        self.strategy.updateImportance(id, importance)
        // Use the provided usage stats (from the strategy) and ensure
        // importance is updated from the freshly fetched record.
        const mergedUsage: CharacterUsageStats = { ...usage, importance }
        const entry = self.buildWarmEntry(record, mergedUsage)
        self.warm.set(id, entry)
        self.placements.set(id, 'warm')
        self.strategy.recordPromotion('warm')
        return
      }

      if (current === 'hot') {
        self.hot.delete(id, { silent: true })
        self.strategy.recordDemotion('hot')
      }

      if (current === 'warm') {
        self.warm.delete(id, { silent: true })
        self.strategy.recordDemotion('warm')
      }

      self.placements.delete(id)
    })
  }

  private buildHotEntry(record: CharacterRecord, usage: CharacterUsageStats): FullCharacterData {
    const legend = this.buildLegend(record)
    const estimatedTokens = this.estimateTokensForRecord(record)
    return {
      kind: 'full',
      record,
      legend,
      usage,
      estimatedTokens,
    }
  }

  private buildWarmEntry(record: CharacterRecord, usage: CharacterUsageStats): WarmCharacterData {
    const essence = this.buildEssence(record)
    const estimatedTokens = Math.ceil(
      (essence.length + record.canonicalName.length) * this.config.compression.tokenCostPerCharacter,
    )

    return {
      kind: 'compressed',
      compressed: {
        id: record.id as CharId,
        name: record.canonicalName,
        essence,
        lastSeenChunk: record.lastSeenChunk,
        importance: usage.importance,
      },
      usage,
      estimatedTokens,
    }
  }

  private buildLegend(record: CharacterRecord) {
    const summary = this.truncate(record.summary ?? '', this.config.compression.legendMaxLength)
    const voice = this.truncate(record.voiceStyle ?? '', this.config.compression.voiceMaxLength)
    return {
      id: record.id as CharId,
      name: record.canonicalName,
      voice,
      summary: summary.length > 0 ? summary : undefined,
    }
  }

  private buildEssence(record: CharacterRecord): string {
    const baseSummary = record.summary ?? ''
    const relationships = record.relationships
      .map((rel) => `${rel.relationship}:${rel.targetId}`)
      .join('|')

    const joined = [baseSummary, relationships].filter((value) => value && value.length > 0).join(' / ')
    return this.truncate(joined, this.config.compression.essenceMaxLength)
  }

  private estimateHotWeight(entry: FullCharacterData): number {
    const summaryBytes = entry.record.summary ? this.bytes(entry.record.summary) : 0
    const relationshipsBytes = entry.record.relationships.reduce((total, relation) => {
      return total + this.bytes(`${relation.relationship}:${relation.targetId}`)
    }, 0)
    const legendBytes =
      this.bytes(entry.legend.name) +
      this.bytes(entry.legend.voice) +
      (entry.legend.summary ? this.bytes(entry.legend.summary) : 0)

    return summaryBytes + relationshipsBytes + legendBytes + 128
  }

  private estimateWarmWeight(entry: WarmCharacterData): number {
    const essenceBytes = this.bytes(entry.compressed.essence)
    return essenceBytes + this.bytes(entry.compressed.name) + 64
  }

  private estimateTokensForRecord(record: CharacterRecord): number {
    const summaryLength = record.summary?.length ?? 0
    const relationshipsLength = record.relationships.length * this.config.tokenEstimation.relationshipsTokenMultiplier
    return Math.ceil(
      (record.canonicalName.length + summaryLength + relationshipsLength) * this.config.compression.tokenCostPerCharacter,
    )
  }

  private bytes(value: string): number {
    return Buffer.byteLength(value, 'utf8')
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value
    }
    return `${value.slice(0, maxLength - 1)}…`
  }

  private extractImportance(record: CharacterRecord): number {
    const metadata = record.metadata as { importance?: unknown } | null | undefined
    const rawImportance = typeof metadata?.importance === 'number' ? metadata.importance : undefined
    if (rawImportance === undefined) {
      return this.config.prediction.defaultImportance
    }

    return Math.min(1, Math.max(0, rawImportance))
  }

  private fetchRecord(
    id: CharId,
  ): Effect.Effect<CharacterRecord, CharacterNotFoundError | MemoryOperationError> {
    const registry = this.registry
    return Effect.gen(function* () {
      const recordOption = yield* Effect.mapError(
        registry.findCharacterById(id),
        (cause: RegistryQueryError | RegistryDecodeError) => new MemoryOperationError({ id, cause }),
      )

      if (Option.isNone(recordOption)) {
        return yield* Effect.fail(new CharacterNotFoundError({ id }))
      }

      return recordOption.value
    })
  }
}
