import { Data } from 'effect'
import type { CacheLevel, CacheStatusSnapshot } from './types'

export class CacheCapacityExceededError extends Data.TaggedError('CacheCapacityExceededError')<{
  readonly requestedWeight: number
  readonly maxWeight: number
}> {}

export interface LruCacheOptions<K, V> {
  readonly maxEntries: number
  readonly maxTotalWeight: number
  readonly maxAgeMs: number
  readonly estimateWeight: (value: V) => number
  readonly level: CacheLevel
  readonly onEvict?: (key: K, value: V) => void
}

interface LruEntry<V> {
  value: V
  weight: number
  createdAt: number
  lastAccessedAt: number
  accessCount: number
}

export class LRUCache<K, V> {
  private readonly store = new Map<K, LruEntry<V>>()
  private totalWeight = 0

  constructor(private readonly options: LruCacheOptions<K, V>) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }

    if (this.isExpired(entry)) {
      this.delete(key)
      return undefined
    }

    entry.lastAccessedAt = Date.now()
    entry.accessCount += 1

    // Reinsert to refresh order
    this.store.delete(key)
    this.store.set(key, entry)

    return entry.value
  }

  set(key: K, value: V): void {
    const weight = this.options.estimateWeight(value)
    if (weight > this.options.maxTotalWeight) {
      throw new CacheCapacityExceededError({
        requestedWeight: weight,
        maxWeight: this.options.maxTotalWeight,
      })
    }

    const now = Date.now()
    const existing = this.store.get(key)
    if (existing) {
      this.totalWeight -= existing.weight
    }

    this.store.set(key, {
      value,
      weight,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    })

    this.totalWeight += weight
    this.trimToCapacity()
  }

  delete(key: K, options?: { silent?: boolean }): boolean {
    const entry = this.store.get(key)
    if (!entry) {
      return false
    }

    this.totalWeight -= entry.weight
    this.store.delete(key)
    if (!options?.silent) {
      this.options.onEvict?.(key, entry.value)
    }
    return true
  }

  clear(): void {
    for (const [key, entry] of this.store.entries()) {
      this.options.onEvict?.(key, entry.value)
    }
    this.store.clear()
    this.totalWeight = 0
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  size(): number {
    return this.store.size
  }

  weight(): number {
    return this.totalWeight
  }

  pruneExpired(): void {
    for (const key of this.store.keys()) {
      const entry = this.store.get(key)
      if (entry && this.isExpired(entry)) {
        this.delete(key)
      }
    }
  }

  snapshot(): CacheStatusSnapshot {
    return {
      level: this.options.level,
      entryCount: this.store.size,
      totalBytes: this.totalWeight,
    }
  }

  private trimToCapacity(): void {
    this.pruneExpired()

    while (this.store.size > this.options.maxEntries || this.totalWeight > this.options.maxTotalWeight) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      const entry = this.store.get(oldestKey)
      if (!entry) {
        this.store.delete(oldestKey)
        continue
      }

      this.store.delete(oldestKey)
      this.totalWeight -= entry.weight
      this.options.onEvict?.(oldestKey, entry.value)
    }
  }

  private isExpired(entry: LruEntry<V>): boolean {
    return Date.now() - entry.lastAccessedAt > this.options.maxAgeMs
  }
}
