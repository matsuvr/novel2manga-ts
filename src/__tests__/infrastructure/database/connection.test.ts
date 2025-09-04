import { describe, expect, it } from 'vitest'
import { D1Adapter } from '@/infrastructure/database/adapters/d1-adapter'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'
import { createDatabaseConnection, detectAdapter } from '@/infrastructure/database/connection'

describe('Database connection', () => {
  it('createDatabaseConnection returns SqliteAdapter when sqlite is provided', () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const { adapter } = createDatabaseConnection({ sqlite: fakeSqlite as unknown as never })
    expect(adapter).toBeInstanceOf(SqliteAdapter)
  })

  it('detectAdapter returns D1Adapter for D1-like binding', () => {
    const fakeD1 = {
      prepare: () => ({ run: async () => ({ success: true }) }),
      batch: async () => [],
    }
    const adapter = detectAdapter(fakeD1)
    expect(adapter).toBeInstanceOf(D1Adapter)
  })

  it('detectAdapter returns SqliteAdapter for sqlite-like db', () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const adapter = detectAdapter(fakeSqlite)
    expect(adapter).toBeInstanceOf(SqliteAdapter)
  })
})
