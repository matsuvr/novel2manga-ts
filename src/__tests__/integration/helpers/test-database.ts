/** Integration test database helper (unified with '@/db') */

import { getDatabase, schema } from '@/db'
import type * as schemaTypes from '@/db/schema'
import { cleanup as cleanupFactory } from '@/services/database/database-service-factory'

/**
 * Ensure the application DB is initialized and return it.
 * Uses '@/db' so reads and writes hit the same in-memory database in tests.
 */
export async function createTestDatabase() {
  // getDatabase() will initialize the in-memory DB (and migrations) in test env
  return getDatabase()
}

export function getTestDatabase() {
  return getDatabase()
}

/**
 * Wipe all application tables using Drizzle delete() to keep state clean between tests.
 * Order matters due to foreign keys; delete from leaf to root.
 */
export function resetTestDatabase() {
  const db = getDatabase()
  // Note: better-sqlite3 is sync; Drizzle ops return immediately.
  try {
    db.delete(schema.tokenUsage).run?.()
  } catch {
    try {
      db.delete(schema.tokenUsage)
    } catch {}
  }
  try {
    db.delete(schema.storageFiles).run?.()
  } catch {
    try {
      db.delete(schema.storageFiles)
    } catch {}
  }
  try {
    db.delete(schema.outputs).run?.()
  } catch {
    try {
      db.delete(schema.outputs)
    } catch {}
  }
  try {
    db.delete(schema.renderStatus).run?.()
  } catch {
    try {
      db.delete(schema.renderStatus)
    } catch {}
  }
  try {
    db.delete(schema.layoutStatus).run?.()
  } catch {
    try {
      db.delete(schema.layoutStatus)
    } catch {}
  }
  try {
    db.delete(schema.chunkAnalysisStatus).run?.()
  } catch {
    try {
      db.delete(schema.chunkAnalysisStatus)
    } catch {}
  }
  try {
    db.delete(schema.episodes).run?.()
  } catch {
    try {
      db.delete(schema.episodes)
    } catch {}
  }
  try {
    db.delete(schema.chunks).run?.()
  } catch {
    try {
      db.delete(schema.chunks)
    } catch {}
  }
  try {
    db.delete(schema.jobStepHistory).run?.()
  } catch {
    try {
      db.delete(schema.jobStepHistory)
    } catch {}
  }
  try {
    db.delete(schema.jobs).run?.()
  } catch {
    try {
      db.delete(schema.jobs)
    } catch {}
  }
  try {
    db.delete(schema.novels).run?.()
  } catch {
    try {
      db.delete(schema.novels)
    } catch {}
  }
  // Auth-related tables (may not exist in all test runs depending on schema)
  try {
    db.delete(schema.authenticator as any).run?.()
  } catch {
    try {
      db.delete(schema.authenticator as any)
    } catch {}
  }
  try {
    db.delete(schema.session as any).run?.()
  } catch {
    try {
      db.delete(schema.session as any)
    } catch {}
  }
  try {
    db.delete(schema.account as any).run?.()
  } catch {
    try {
      db.delete(schema.account as any)
    } catch {}
  }
  try {
    db.delete(schema.user as any).run?.()
  } catch {
    try {
      db.delete(schema.user as any)
    } catch {}
  }
  try {
    db.delete(schema.verificationToken as any).run?.()
  } catch {
    try {
      db.delete(schema.verificationToken as any)
    } catch {}
  }
}

export function closeTestDatabase() {
  // Clear global factory reference; underlying raw DB will be cleaned by app/test lifecycle
  try {
    cleanupFactory()
  } catch {
    /* ignore */
  }
}

export function createTestUser(overrides: Partial<schemaTypes.NewUser> = {}): schemaTypes.NewUser {
  const idDefault = overrides.id ?? 'test-user-id'
  const emailDefault = overrides.email ?? `${idDefault}@example.com`
  return {
    id: idDefault,
    name: overrides.name ?? 'Test User',
    email: emailDefault,
    emailVerified: overrides.emailVerified ?? null,
    image: overrides.image ?? null,
    emailNotifications: overrides.emailNotifications ?? true,
    theme: overrides.theme ?? 'light',
    language: overrides.language ?? 'ja',
    ...overrides,
  }
}

export function createTestNovel(
  userId: string,
  overrides: Partial<schemaTypes.NewNovel> = {},
): schemaTypes.NewNovel {
  return {
    id: 'test-novel-id',
    title: 'Test Novel',
    author: 'Test Author',
    originalTextPath: '/test/novel.txt',
    textLength: 1000,
    language: 'ja',
    userId,
    ...overrides,
  }
}

export function createTestJob(
  novelId: string,
  userId: string,
  overrides: Partial<schemaTypes.NewJob> = {},
): schemaTypes.NewJob {
  return {
    id: 'test-job-id',
    novelId,
    jobName: 'Test Job',
    userId,
    status: 'pending',
    currentStep: 'initialized',
    ...overrides,
  }
}
