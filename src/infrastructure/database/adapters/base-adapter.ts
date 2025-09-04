// Database adapter abstraction to hide sync/async differences across engines.
// - No fallback behavior: errors must be explicit and stop processing.

export abstract class DatabaseAdapter {
  // Execute a transactional operation with a transaction context.
  // The tx is intentionally typed as unknown to avoid leaking engine-specific types here.
  // Callers must narrow/cast appropriately at the use site.
  abstract transaction<TTx, T>(fn: (tx: TTx) => T | Promise<T>): Promise<T>

  // Execute synchronously. Engines that are async-only must throw.
  abstract runSync<T>(fn: () => T): T

  // True if the underlying engine supports synchronous operations.
  abstract isSync(): boolean
}

export class UnsupportedSyncOperationError extends Error {
  constructor(message = 'Synchronous execution is not supported by this adapter') {
    super(message)
    this.name = 'UnsupportedSyncOperationError'
  }
}
