import { describe, expect, it } from 'vitest'
import { UnsupportedSyncOperationError } from '@/infrastructure/database/adapters/base-adapter'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'

describe('Database adapters', () => {
  it('SqliteAdapter: isSync=true and runSync works', () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
  const adapter = new SqliteAdapter(fakeSqlite as unknown as ConstructorParameters<typeof SqliteAdapter>[0])
    expect(adapter.isSync()).toBe(true)
    const result = adapter.runSync(() => 123)
    expect(result).toBe(123)
  })

  it('SqliteAdapter: transaction rejects async callback', async () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
  const adapter = new SqliteAdapter(fakeSqlite as unknown as ConstructorParameters<typeof SqliteAdapter>[0])
    await expect(
      adapter.transaction(async () => {
        return Promise.resolve(1)
      }),
    ).rejects.toThrowError(/Async work inside a synchronous/)
  })

  it('SqliteAdapter: transaction returns sync result', async () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
  const adapter = new SqliteAdapter(fakeSqlite as unknown as ConstructorParameters<typeof SqliteAdapter>[0])
    const out = await adapter.transaction(() => 42)
    expect(out).toBe(42)
  })

  describe.skip('database adapters (Cloudflare D1 tests removed)', () => {
    // D1Adapter and isD1Like were part of the Cloudflare D1 implementation.
    // Those tests were removed during migration to SQLite local adapters.
    // import { D1Adapter, isD1Like } from '@/infrastructure/database/adapters/d1-adapter'
    // Tests for D1Adapter and isD1Like were removed as part of the migration to
    // SQLite and local adapters. This entire suite was skipped to remove the
    // Cloudflare runtime dependency (D1). If needed, reintroduce platform
    // specific tests behind feature flags.
})
})
