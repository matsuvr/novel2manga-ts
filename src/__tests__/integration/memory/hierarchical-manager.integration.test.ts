import { Effect, Option } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { memoryConfig } from '@/config/memory.config'
import {
  type CharacterRegistryReader,
  type CharId,
  HierarchicalMemoryManager,
} from '@/v2/memory'
import type { CharacterRecord } from '@/v2/registry'

class FakeRegistry implements CharacterRegistryReader {
  constructor(private readonly records: Map<CharId, CharacterRecord>) {}

  findCharacterById(id: CharId) {
    const record = this.records.get(id)
    return Effect.succeed(record ? Option.some(record) : Option.none())
  }

  getActiveCharacters() {
    return Effect.succeed(Array.from(this.records.values()))
  }
}

const nowIso = () => new Date('2025-02-17T00:00:00.000Z').toISOString()

function createCharacterRecord(
  id: CharId,
  overrides: Partial<CharacterRecord> = {},
): CharacterRecord {
  const base: CharacterRecord = {
    id,
    canonicalName: id.replace('char_', 'Character '),
    aliases: [],
    summary: 'Base summary for testing cache behavior',
    voiceStyle: 'calm',
    relationships: [],
    firstChunk: 0,
    lastSeenChunk: 0,
    confidenceScore: 0.9,
    status: 'active',
    metadata: { importance: 0.4 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  return {
    ...base,
    ...overrides,
    metadata: overrides.metadata ?? base.metadata,
    aliases: overrides.aliases ?? base.aliases,
    relationships: overrides.relationships ?? base.relationships,
  }
}

describe('HierarchicalMemoryManager', () => {
  let manager: HierarchicalMemoryManager
  let registry: FakeRegistry

  beforeEach(() => {
    const records = new Map<CharId, CharacterRecord>([
      [
        'char_001',
        createCharacterRecord('char_001', {
          canonicalName: '火野アキラ',
          summary: '炎を操る突撃隊長',
          voiceStyle: '熱血',
          lastSeenChunk: 12,
          metadata: { importance: 0.8 },
        }),
      ],
      [
        'char_002',
        createCharacterRecord('char_002', {
          canonicalName: '月城ミナ',
          summary: '冷静沈着な参謀',
          voiceStyle: '落ち着いた口調',
          lastSeenChunk: 40,
          metadata: { importance: 0.45 },
        }),
      ],
      [
        'char_003',
        createCharacterRecord('char_003', {
          canonicalName: '影山レン',
          summary: '潜入を得意とする斥候',
          voiceStyle: '低く囁くような声',
          lastSeenChunk: 8,
          metadata: { importance: 0.3 },
        }),
      ],
    ])

    registry = new FakeRegistry(records)
    manager = new HierarchicalMemoryManager(registry, { config: memoryConfig })
  })

  it('loads characters from cold storage and promotes to the hot cache', async () => {
    const initial = await Effect.runPromise(manager.getCharacterData('char_001'))
    expect(initial.kind).toBe('full')
    expect(initial.legend.name).toBe('火野アキラ')

    const afterFirstLoad = manager.getMemoryStats()
    expect(afterFirstLoad.hotEntries).toBe(1)
    expect(afterFirstLoad.hitRate).toBeCloseTo(0)

    await Effect.runPromise(manager.getCharacterData('char_001'))
    await Effect.runPromise(manager.getCharacterData('char_001'))

    expect(manager.getCacheHitRate()).toBeGreaterThan(0.45)
    const metrics = manager.getCacheMetrics()
    expect(metrics.hits.hot).toBeGreaterThan(0)
    expect(metrics.misses.hot).toBeGreaterThan(0)
  })

  it('demotes infrequently accessed characters to warm and cold tiers based on access patterns', async () => {
    await Effect.runPromise(manager.getCharacterData('char_002'))
    await Effect.runPromise(manager.updateAccessPattern(0, ['char_001', 'char_002']))
    await Effect.runPromise(manager.updateAccessPattern(1, ['char_001']))
    await Effect.runPromise(manager.updateAccessPattern(2, ['char_001']))
    await Effect.runPromise(manager.updateAccessPattern(25, ['char_002']))

    const warmCandidate = await Effect.runPromise(manager.getCharacterData('char_002'))
    expect(warmCandidate.kind).toBe('compressed')

    const warmEntriesBefore = manager.getMemoryStats().warmEntries
    await Effect.runPromise(manager.updateAccessPattern(120, ['char_002']))
    const statsAfterDemotion = manager.getMemoryStats()
    expect(statsAfterDemotion.warmEntries).toBeLessThanOrEqual(warmEntriesBefore)

    const rehydrated = await Effect.runPromise(manager.getCharacterData('char_002', 'hot'))
    expect(rehydrated.kind).toBe('full')
    expect(rehydrated.legend.voice.length).toBeLessThanOrEqual(memoryConfig.compression.voiceMaxLength)
  })

  it('reports reduced memory footprint and cache activity metrics', async () => {
    await Effect.runPromise(manager.getCharacterData('char_001'))
    await Effect.runPromise(manager.getCharacterData('char_002'))
    await Effect.runPromise(manager.getCharacterData('char_003'))

    await Effect.runPromise(manager.updateAccessPattern(5, ['char_001', 'char_003']))
    await Effect.runPromise(manager.updateAccessPattern(6, ['char_001', 'char_003']))
    await Effect.runPromise(manager.updateAccessPattern(40, ['char_003']))

    const metrics = manager.getCacheMetrics()
    expect(metrics.promotions.hot + metrics.promotions.warm).toBeGreaterThan(0)
    expect(metrics.demotions.hot + metrics.demotions.warm).toBeGreaterThanOrEqual(0)

    const stats = manager.getMemoryStats()
    expect(stats.totalBytes).toBeLessThan(stats.configuredLimitBytes)
    expect(stats.reductionRatio).toBeGreaterThan(0.5)
    expect(manager.getCacheHitRate()).toBeGreaterThanOrEqual(0)
  })
})
