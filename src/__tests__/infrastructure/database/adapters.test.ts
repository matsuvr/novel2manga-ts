import { describe, expect, it } from 'vitest'
import { UnsupportedSyncOperationError } from '@/infrastructure/database/adapters/base-adapter'
// D1 support was removed from the project; don't import D1 symbols in tests
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
  // D1 adapter tests removed as D1 support has been deleted from the project.
})
