import { DatabaseAdapter, UnsupportedSyncOperationError } from './base-adapter'

/**
 * D1Adapter (compat shim)
 *
 * Cloudflare D1 support has been removed from the project. This shim keeps the
 * module API shape but throws explicit errors at runtime to avoid accidental
 * usage. Callers should migrate to the sqlite/better-sqlite3 adapter.
 */
export class D1Adapter extends DatabaseAdapter {
  constructor(_binding: unknown) {
    super()
    throw new Error('D1Adapter is no longer supported. Remove D1 bindings and use the sqlite adapter.')
  }

  async transaction<TTx, T>(_fn: (tx: TTx) => T | Promise<T>): Promise<T> {
    throw new Error('D1Adapter is no longer supported')
  }

  runSync<T>(_fn: () => T): T {
    throw new UnsupportedSyncOperationError()
  }

  isSync(): boolean {
    return false
  }

  getBinding(): unknown {
    throw new Error('D1Adapter is no longer supported')
  }
}

// Legacy type guard removed. Use explicit feature detection in callers if needed.
