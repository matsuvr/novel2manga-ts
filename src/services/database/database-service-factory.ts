import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'
import { SqliteAdapter } from '@/infrastructure/database/adapters/sqlite-adapter'
import type { DatabaseConnection } from '@/infrastructure/database/connection'
import { getLogger } from '@/infrastructure/logging/logger'
import { ChunkDatabaseService } from './chunk-database-service'
import { EpisodeDatabaseService } from './episode-database-service'
import { JobDatabaseService } from './job-database-service'
import { LayoutDatabaseService } from './layout-database-service'
import { NovelDatabaseService } from './novel-database-service'
import { OutputDatabaseService } from './output-database-service'
import { RenderDatabaseService } from './render-database-service'
import { TokenUsageDatabaseService } from './token-usage-database-service'
import { type Database, TransactionService } from './transaction-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

/**
 * Factory for creating database services
 * Provides unified access to all domain-specific database services
 * Follows Factory and Dependency Injection patterns
 */
export class DatabaseServiceFactory {
  private readonly episodeService: EpisodeDatabaseService
  private readonly jobService: JobDatabaseService
  private readonly novelService: NovelDatabaseService
  private readonly chunkService: ChunkDatabaseService
  private readonly outputService: OutputDatabaseService
  private readonly renderService: RenderDatabaseService
  private readonly layoutService: LayoutDatabaseService
  private readonly tokenUsageService: TokenUsageDatabaseService
  private readonly transactionService: TransactionService
  private readonly db: Database
  private readonly adapter: DatabaseAdapter

  constructor(connection: DatabaseConnection<Database>) {
    this.db = connection.db
    this.adapter = connection.adapter

    // Initialize all services with database and adapter
    this.episodeService = new EpisodeDatabaseService(this.db, this.adapter)
    this.jobService = new JobDatabaseService(this.db, this.adapter)
    this.novelService = new NovelDatabaseService(this.db, this.adapter)
    this.chunkService = new ChunkDatabaseService(this.db, this.adapter)
    this.outputService = new OutputDatabaseService(this.db, this.adapter)
    this.renderService = new RenderDatabaseService(this.db, this.adapter)
    this.layoutService = new LayoutDatabaseService(this.db, this.adapter)
    this.tokenUsageService = new TokenUsageDatabaseService(this.db, this.adapter)
    this.transactionService = new TransactionService(this.db, this.adapter)
  }

  /**
   * Create factory from legacy database instance (backward compatibility)
   */
  static fromDatabase(db: DrizzleDatabase): DatabaseServiceFactory {
    const adapter = new SqliteAdapter(db)
    return new DatabaseServiceFactory({ db, adapter })
  }

  /**
   * Get episode-specific database operations
   */
  episodes(): EpisodeDatabaseService {
    return this.episodeService
  }

  /**
   * Get job-specific database operations
   */
  jobs(): JobDatabaseService {
    return this.jobService
  }

  /**
   * Get novel-specific database operations
   */
  novels(): NovelDatabaseService {
    return this.novelService
  }

  /**
   * Get chunk-specific database operations
   */
  chunks(): ChunkDatabaseService {
    return this.chunkService
  }

  /**
   * Get output-specific database operations
   */
  outputs(): OutputDatabaseService {
    return this.outputService
  }

  /**
   * Get render-specific database operations
   */
  render(): RenderDatabaseService {
    return this.renderService
  }

  /**
   * Get layout-specific database operations
   */
  layout(): LayoutDatabaseService {
    return this.layoutService
  }

  /**
   * Get token-usage-specific database operations
   */
  tokenUsage(): TokenUsageDatabaseService {
    return this.tokenUsageService
  }

  /**
   * Get transaction service for complex operations
   */
  transactions(): TransactionService {
    return this.transactionService
  }

  /**
   * Execute cross-domain operation in a single transaction
   * Use this for operations that span multiple domains
   */
  async executeAcrossDomains<T>(
    operation: (services: {
      episodes: EpisodeDatabaseService
      jobs: JobDatabaseService
      novels: NovelDatabaseService
      chunks: ChunkDatabaseService
      outputs: OutputDatabaseService
      render: RenderDatabaseService
      layout: LayoutDatabaseService
      tokenUsage: TokenUsageDatabaseService
      tx: TransactionService
    }) => T | Promise<T>,
  ): Promise<T> {
    return this.transactionService.execute((_db) => {
      // Create transaction-aware instances for cross-domain operations
      const episodes = new EpisodeDatabaseService(this.db, this.adapter)
      const jobs = new JobDatabaseService(this.db, this.adapter)
      const novels = new NovelDatabaseService(this.db, this.adapter)
      const chunks = new ChunkDatabaseService(this.db, this.adapter)
      const outputs = new OutputDatabaseService(this.db, this.adapter)
      const render = new RenderDatabaseService(this.db, this.adapter)
      const layout = new LayoutDatabaseService(this.db, this.adapter)
      const tokenUsage = new TokenUsageDatabaseService(this.db, this.adapter)

      return operation({
        episodes,
        jobs,
        novels,
        chunks,
        outputs,
        render,
        layout,
        tx: this.transactionService,
        tokenUsage,
      })
    })
  }

  /**
   * Get raw database instance
   * Use only when absolutely necessary
   */
  getRawDatabase(): Database {
    return this.db
  }

  /**
   * Get the database adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter
  }
}

/**
 * Global factory instance
 * This will be initialized with the application's database connection
 */
let globalFactory: DatabaseServiceFactory | null = null

/**
 * Initialize the global database service factory with a database connection
 * If a factory already exists, it will be cleaned up first
 */
export function initializeDatabaseServiceFactory(
  connectionOrDb: DatabaseConnection<Database> | DrizzleDatabase,
): void {
  // Clean up existing factory if it exists
  if (globalFactory) {
    // Avoid closing the existing factory's raw DB here. In test environments
    // multiple test suites may initialize the factory concurrently with
    // different sqlite handles. Calling cleanup() will close the other
    // suites' connections and cause "The database connection is not open"
    // errors. Instead, drop our reference and allow the test harness (which
    // manages TestDatabase lifecycles) to close DBs explicitly.
    getLogger().warn('initializeDatabaseServiceFactory: replacing existing globalFactory without closing raw DB (test-safe)')
    globalFactory = null
  }

  // Handle both connection objects and legacy database instances
  // Defensive normalization: some tests may pass a raw better-sqlite3 handle or a drizzle-like
  // object that lacks runtime helpers (transaction/schema). Detect common cases and normalize
  // to a proper DatabaseConnection<DrizzleDatabase> before constructing the factory.
  const maybeConn = connectionOrDb as unknown

  // Diagnostic logging: print a compact shape summary to help locate where invalid dbs originate
  try {
    const shapeSummary = (() => {
      const out: Record<string, unknown> = {}
      out.typeof = typeof connectionOrDb
      if (connectionOrDb && typeof connectionOrDb === 'object') {
        const asObj = connectionOrDb as unknown as Record<string, unknown>
        out.keys = Object.keys(asObj)
        out.hasTransaction =
          typeof (asObj as unknown as { transaction?: unknown }).transaction === 'function'
        out.hasSchema = 'schema' in asObj
        if ('adapter' in asObj) {
          try {
            const adapter = (asObj as unknown as Record<string, unknown>).adapter
            out.adapterType =
              adapter && (adapter as { constructor?: { name?: string } })
                ? (adapter as { constructor?: { name?: string } }).constructor?.name
                : typeof adapter
            out.adapterHasIsSync = !!(
              adapter && typeof (adapter as { isSync?: unknown }).isSync === 'function'
            )
            out.adapterHasDb = !!(
              adapter &&
              (adapter as unknown) &&
              (adapter as unknown as Record<string, unknown>).db
            )
            if ((adapter as unknown as Record<string, unknown>).db) {
              const adapterDb = (adapter as unknown as Record<string, unknown>)
                .db as unknown as Record<string, unknown>
              out.adapterDbKeys = Object.keys(adapterDb)
              out.adapterDbHasTransaction =
                typeof (adapterDb as unknown as { transaction?: unknown }).transaction ===
                'function'
            }
          } catch (_e) {
            // ignore
          }
        }
      }
      return out
    })()
    // Use console.info so test output surfaces during CI runs
    // Keep message compact to avoid huge logs
    getLogger().debug('DB factory init shape', { shape: shapeSummary })
  } catch (_e) {
    // best-effort logging only
  }

  // If it's already a DatabaseConnection with adapter, try to normalize it.
  if (
    maybeConn &&
    typeof maybeConn === 'object' &&
    'adapter' in (maybeConn as unknown as Record<string, unknown>)
  ) {
    const conn = maybeConn as DatabaseConnection<Database>

    // 1) If conn.db already looks like a drizzle instance, prefer it.
    try {
      if (
        conn.db &&
        typeof (conn.db as unknown as { transaction?: unknown }).transaction === 'function'
      ) {
        // If the provided conn.db looks drizzle-like but doesn't expose
        // a wrapped schema, avoid mutating it by attaching the raw module
        // schema. Instead, try to create a fresh drizzle wrapper from the
        // underlying sqlite handle and replace conn.db with that wrapped
        // instance so the factory receives a canonical Drizzle DB with
        // internal Symbols intact.
        if (!('schema' in (conn.db as unknown as Record<string, unknown>))) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const schemaMod = require('@/db/schema')
            const maybeDb = conn.db as unknown as Record<string, unknown>
            const candidateRaw = maybeDb && (maybeDb.sqlite || maybeDb.db || maybeDb.client)
            if (
              candidateRaw &&
              typeof candidateRaw === 'object' &&
              candidateRaw !== null &&
              'prepare' in candidateRaw &&
              typeof (candidateRaw as { prepare: unknown }).prepare === 'function'
            ) {
              try {
                const { drizzle } = require('drizzle-orm/better-sqlite3')
                const wrapped = drizzle(candidateRaw, { schema: schemaMod })
                // Replace conn.db with the wrapped instance rather than
                // mutating the existing object. Keep adapter as-is.
                ;(conn as unknown as Record<string, unknown>).db = wrapped
              } catch (wrapErr) {
                // If wrapping fails, fall back to leaving conn.db untouched
                getLogger().warn('initializeDatabaseServiceFactory: failed to create wrapped drizzle instance, leaving conn.db as-is', { error: String(wrapErr) })
              }
            } else {
              // No raw handle available: safest course is to leave conn.db as-is
            }
          } catch (_e) {
            // best-effort: leave conn.db unchanged
          }
        }
        globalFactory = new DatabaseServiceFactory(conn)
        getLogger().debug('DB factory: using conn.db as-is')
        // final runtime assertion happens below
        // return after assignment
        // but do not return here; fall through to final assertion block
      } else if (conn.adapter) {
        // 2) if adapter contains the real db, prefer adapter.db
        const adapterAny = conn.adapter as unknown as Record<string, unknown>
        if (
          adapterAny?.db &&
          typeof (adapterAny.db as unknown as Record<string, unknown>).transaction === 'function'
        ) {
          const fixedConn: DatabaseConnection<Database> = {
            db: adapterAny.db as Database,
            adapter: conn.adapter,
          }
          // ensure schema attached without overwriting wrapped schema
          try {
            if (!('schema' in (fixedConn.db as unknown as Record<string, unknown>))) {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const schemaMod = require('@/db/schema')
              Object.defineProperty(fixedConn.db as unknown as Record<string, unknown>, 'schema', {
                value: schemaMod,
                enumerable: false,
                configurable: true,
                writable: false,
              })
            }
          } catch {
            // ignore
          }
          globalFactory = new DatabaseServiceFactory(fixedConn)
          getLogger().debug('DB factory: using adapter.db')
        } else if (conn.db) {
          // conn.db exists but isn't drizzle-like. We avoid trying to re-wrap
          // arbitrary conn.db here because type/signature mismatches can occur.
          // Prefer adapter.db or other normalization strategies above.
          getLogger().debug('DB factory: conn.db present but not drizzle-like; skipping unsafe wrap')
        }
      }

      // If we didn't set globalFactory yet, fall through to later attempts / error
      if (globalFactory) return
    } catch {
      // ignore and try other normalization strategies below
    }
  }

  // If it's a drizzle BetterSQLite3Database instance with transaction method, use it
  const isDrizzleLike = (obj: unknown): obj is DrizzleDatabase => {
    try {
      if (!obj || typeof obj !== 'object') return false
      const asUnknown = obj as unknown
      // Narrow via unknown to satisfy TS strict checks
      return typeof (asUnknown as { transaction?: unknown }).transaction === 'function'
    } catch {
      return false
    }
  }

  if (isDrizzleLike(connectionOrDb)) {
    // It's a drizzle-compatible instance
    globalFactory = DatabaseServiceFactory.fromDatabase(connectionOrDb as DrizzleDatabase)
    return
  }

  // We intentionally avoid attempting to wrap arbitrary objects using drizzle here.
  // Normalization is handled via:
  //  - prefer conn.db when it's drizzle-like
  //  - prefer conn.adapter.db when present and drizzle-like
  //  - accept a direct drizzle instance via isDrizzleLike
  // Tests should ensure they pass a proper drizzle instance (TestDatabaseManager guarantees this).

  // If we reach here and still don't have a factory, provide a more informative error
  if (!globalFactory) {
    // Attempt to print the shape of the provided value for easier debugging
    try {
      const asObj = connectionOrDb as unknown as Record<string, unknown>
      const summary: Record<string, unknown> = { typeof: typeof connectionOrDb }
      if (asObj && typeof asObj === 'object') {
        summary.keys = Object.keys(asObj)
        summary.hasTransaction =
          typeof (asObj as unknown as Record<string, unknown>).transaction === 'function'
        summary.hasSchema = 'schema' in asObj
      }
      getLogger().error('initializeDatabaseServiceFactory cannot normalize connection shape', { summary })
    } catch (_e) {
      // ignore
    }
    throw new Error(
      'initializeDatabaseServiceFactory received unsupported database/connection shape',
    )
  }

  // Final runtime assertion: ensure the created globalFactory has a raw database that exposes transaction and schema
  try {
    const raw = globalFactory.getRawDatabase() as unknown as Record<string, unknown>
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof (raw as unknown as Record<string, unknown>).transaction !== 'function' ||
      !('schema' in raw)
    ) {
      const shape = {
        keys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
        hasTransaction:
          raw && typeof (raw as unknown as Record<string, unknown>).transaction === 'function',
        hasSchema: raw && raw && 'schema' in raw,
      }
      throw new Error(
        `DatabaseFactory initialization produced invalid raw database: ${JSON.stringify(shape)}`,
      )
    }
  } catch (err) {
    // If assertion fails, clean up and rethrow for faster feedback in CI/tests
    try {
      cleanup()
    } catch (cleanupErr) {
      getLogger().warn('cleanup after failed DB init also failed', { error: String(cleanupErr) })
    }
    throw err
  }
}

/**
 * Get the global database service factory
 */
export function getDatabaseServiceFactory(): DatabaseServiceFactory {
  if (!globalFactory) {
    throw new Error(
      'DatabaseServiceFactory not initialized. Call initializeDatabaseServiceFactory first.',
    )
  }
  return globalFactory
}

/**
 * Clean up the global database service factory
 * Should be called when the application is shutting down
 */
export function cleanup(): void {
  if (globalFactory) {
    const raw = globalFactory.getRawDatabase() as unknown
    // In test environments, TestDatabaseManager is responsible for closing
    // sqlite handles. If we close the raw DB here, other test suites that
    // share the global factory may fail with "The database connection is not open".
    // Therefore, avoid closing the raw DB when running under tests and
    // only clear the in-memory factory reference. The TestDatabaseManager
    // cleanup routines will handle actual sqlite.close() calls.
    try {
      // In test environments, TestDatabaseManager is responsible for closing sqlite handles.
      if (process.env.NODE_ENV === 'test') {
        getLogger().debug('cleanup(): skipping raw DB close in test environment (delegated to TestDatabaseManager)')
      } else {
        // Extra guard: if the raw handle carries a test-suite ownership marker,
        // avoid closing it even in non-test envs to be conservative. This protects
        // against accidental leakage of test handles into other contexts.
        try {
          const ownerMarker =
            raw && typeof raw === 'object'
              ? (raw as unknown as Record<string, unknown>).__testSuiteName
              : undefined
          if (ownerMarker) {
            getLogger().debug('cleanup(): raw DB appears to be owned by test suite; skipping close for safety', { ownerMarker: String(ownerMarker) })
          } else if (
            raw &&
            typeof raw === 'object' &&
            'close' in raw &&
            typeof (raw as { close: unknown }).close === 'function'
          ) {
            ;(raw as { close: () => void }).close()
          }
        } catch (_guardErr) {
          // If introspection fails, attempt best-effort close as before
          try {
            if (
              raw &&
              typeof raw === 'object' &&
              'close' in raw &&
              typeof (raw as { close: unknown }).close === 'function'
            ) {
              ;(raw as { close: () => void }).close()
            }
          } catch (_e) {
            getLogger().warn('database-service-factory.cleanup: failed to close raw DB after introspection error', { error: String(_e) })
          }
        }
      }
    } catch (err) {
      // best-effort: log and continue to clear factory reference
      // eslint-disable-next-line no-console
      getLogger().warn('database-service-factory.cleanup: failed to close raw DB, continuing to clear factory', { error: String(err) })
    }
    globalFactory = null
  }
}

/**
 * Check if the factory is initialized
 */
export function isFactoryInitialized(): boolean {
  return globalFactory !== null
}

/**
 * Convenience functions for common operations
 */
export const db = {
  episodes: () => getDatabaseServiceFactory().episodes(),
  jobs: () => getDatabaseServiceFactory().jobs(),
  novels: () => getDatabaseServiceFactory().novels(),
  chunks: () => getDatabaseServiceFactory().chunks(),
  outputs: () => getDatabaseServiceFactory().outputs(),
  render: () => getDatabaseServiceFactory().render(),
  layout: () => getDatabaseServiceFactory().layout(),
  tokenUsage: () => getDatabaseServiceFactory().tokenUsage(),
  transactions: () => getDatabaseServiceFactory().transactions(),
  executeAcrossDomains: async (
    operation: Parameters<DatabaseServiceFactory['executeAcrossDomains']>[0],
  ) => getDatabaseServiceFactory().executeAcrossDomains(operation),

  // Helper to check adapter capabilities
  isSync: () => getDatabaseServiceFactory().getAdapter().isSync(),
}
