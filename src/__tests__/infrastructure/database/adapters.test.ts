import { describe, expect, it } from 'vitest'
import { UnsupportedSyncOperationError } from '@/infrastructure/database/adapters/base-adapter'
import { D1Adapter, isD1Like } from '@/infrastructure/database/adapters/d1-adapter'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'

describe('Database adapters', () => {
  it('SqliteAdapter: isSync=true and runSync works', () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const adapter = new SqliteAdapter(fakeSqlite as unknown as Parameters<typeof SqliteAdapter>[0])
    expect(adapter.isSync()).toBe(true)
    const result = adapter.runSync(() => 123)
    expect(result).toBe(123)
  })

  it('SqliteAdapter: transaction rejects async callback', async () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const adapter = new SqliteAdapter(fakeSqlite as unknown as Parameters<typeof SqliteAdapter>[0])
    await expect(
      adapter.transaction(async () => {
        return Promise.resolve(1)
      }),
    ).rejects.toThrowError(/Async work inside a synchronous/)
  })

  it('SqliteAdapter: transaction returns sync result', async () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const adapter = new SqliteAdapter(fakeSqlite as unknown as Parameters<typeof SqliteAdapter>[0])
    const out = await adapter.transaction(() => 42)
    expect(out).toBe(42)
  })

  it('D1Adapter: isSync=false and runSync throws', () => {
    const fakeD1 = {
      prepare: () => ({ run: async () => ({ success: true }) }),
      batch: async () => [],
    }
    const adapter = new D1Adapter(
      fakeD1 as unknown as import('@cloudflare/workers-types').D1Database,
    )
    expect(adapter.isSync()).toBe(false)
    expect(() => adapter.runSync(() => 1)).toThrow(UnsupportedSyncOperationError)
  })

  it('D1Adapter: transaction awaits callback', async () => {
    const fakeD1 = {
      prepare: () => ({ run: async () => ({ success: true }) }),
      batch: async () => [],
    }
    const adapter = new D1Adapter(
      fakeD1 as unknown as import('@cloudflare/workers-types').D1Database,
    )
    const out = await adapter.transaction(async () => 77)
    expect(out).toBe(77)
  })

  it('isD1Like: detects D1-like object', () => {
    const fake = { prepare: () => ({}), batch: async () => [] }
    expect(isD1Like(fake)).toBe(true)
    expect(isD1Like({})).toBe(false)
  })
})
