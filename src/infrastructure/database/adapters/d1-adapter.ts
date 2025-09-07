import type { D1Database } from '@cloudflare/workers-types'
import { DatabaseAdapter, UnsupportedSyncOperationError } from './base-adapter'

/**
 * D1Adapter wraps a Cloudflare D1 binding.
 * Notes:
 * - D1 auto-commits statements; `batch()` executes statements sequentially and transactionally.
 * - This adapter exposes a transaction(fn) that simply awaits `fn`.
 *   Callers SHOULD use D1's `batch()` within `fn` to achieve atomicity.
 * - No implicit fallbacks are implemented; misuse results in explicit errors at call sites.
 */
export class D1Adapter extends DatabaseAdapter {
  constructor(private readonly d1: D1Database) {
    super()
  }

  async transaction<TTx, T>(fn: (tx: TTx) => T | Promise<T>): Promise<T> {
    // There is no explicit BEGIN/COMMIT in the Worker binding API.
    // Atomicity must be achieved via `batch()` by the caller.
    return await fn(this.d1 as unknown as TTx)
  }

  runSync<T>(_fn: () => T): T {
    // D1 is async-only; synchronous execution is unsupported.
    throw new UnsupportedSyncOperationError()
  }

  isSync(): boolean {
    return false
  }

  getBinding(): D1Database {
    return this.d1
  }
}

// Type guard helpers for detection
export function isD1Like(value: unknown): value is D1Database {
  const v = value as { prepare?: unknown; batch?: unknown }
  return Boolean(
    v && typeof v === 'object' && typeof v.prepare === 'function' && typeof v.batch === 'function',
  )
}
