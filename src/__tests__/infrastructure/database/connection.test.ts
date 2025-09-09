import { describe, expect, it } from 'vitest'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'
import { createDatabaseConnection } from '@/infrastructure/database/connection'

describe('Database connection', () => {
  it('createDatabaseConnection returns SqliteAdapter when sqlite is provided', () => {
    const fakeSqlite = { transaction: (cb: (tx: unknown) => unknown) => cb({}) }
    const { adapter } = createDatabaseConnection({ sqlite: fakeSqlite as unknown as never })
    expect(adapter).toBeInstanceOf(SqliteAdapter)
  })
  // D1/detectAdapter tests removed: D1 support and detectAdapter were removed.
})
