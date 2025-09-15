import { spawnSync } from 'node:child_process'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../db/schema'

export type TestDbHandle = {
  sqlite: import('better-sqlite3').Database
  db: BetterSQLite3Database<typeof schema>
}

function isNativeModuleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /NODE_MODULE_VERSION/i.test(message) ||
    /ERR_DLOPEN_FAILED/i.test(message) ||
    /did not self-register/i.test(message)
  )
}

function rebuildBetterSqlite3(): void {
  const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`npm rebuild better-sqlite3 failed with code ${result.status}`)
  }
}

function loadBetterSqlite3(reload = false) {
  // Use require to allow try/catch and potential cache delete
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const req = require as NodeRequire
  if (reload) {
    try {
      delete req.cache[req.resolve('better-sqlite3')]
    } catch {
      // ignore
    }
  }
  return req('better-sqlite3') as typeof import('better-sqlite3')
}

export function createTestDb(migrationsFolder = `${process.cwd()}/drizzle`) {
  let Driver: typeof import('better-sqlite3')
  try {
    Driver = loadBetterSqlite3()
  } catch (err) {
    if (!isNativeModuleError(err)) throw err
    // Attempt to rebuild once
    try {
      rebuildBetterSqlite3()
      Driver = loadBetterSqlite3(true)
    } catch {
      // If rebuild fails, surface the failure to the caller
      throw new Error('Failed to rebuild better-sqlite3 during test DB initialization')
    }
  }

  const sqlite = new Driver(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return { sqlite, db }
}

export function cleanupTestDb(handle: TestDbHandle): void {
  try {
    handle.sqlite.close()
  } catch {
    /* ignore */
  }
}
