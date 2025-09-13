/**
 * Comprehensive Database Mock Configuration
 *
 * This module provides complete mocking for all database tables and operations
 * used throughout the application. It supports both unit and integration testing
 * with proper CRUD operations and type safety.
 */

import { vi } from 'vitest'

// Mock table interface for CRUD operations
interface MockTable {
  findFirst: ReturnType<typeof vi.fn>
  findMany: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
  // Drizzle-specific methods
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  offset: ReturnType<typeof vi.fn>
}

// Create mock table with default implementations
function createMockTable(): MockTable {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    update: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    delete: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    upsert: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    count: vi.fn().mockResolvedValue(0),
    // Drizzle query builder methods
    select: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    insert: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    where: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    orderBy: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    limit: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    offset: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  }
}

// Create a comprehensive mock query builder
const createMockQueryBuilder = () => {
  const mockQueryBuilder = {
    from: vi.fn().mockImplementation((_table) => {
      // Return a new builder that can handle the table-specific operations
      return {
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
      }
    }),
    where: vi.fn().mockImplementation(() => mockQueryBuilder),
    orderBy: vi.fn().mockImplementation(() => mockQueryBuilder),
    limit: vi.fn().mockImplementation(() => mockQueryBuilder),
    offset: vi.fn().mockImplementation(() => mockQueryBuilder),
    set: vi.fn().mockImplementation(() => mockQueryBuilder),
    values: vi.fn().mockImplementation(() => mockQueryBuilder),
    returning: vi.fn().mockImplementation(() => mockQueryBuilder),
    execute: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 }),
  }

  // Return the builder directly - it's chainable and methods return promises when needed
  return mockQueryBuilder
}

// Mock database with all required tables
export const mockDatabase = {
  // Core application tables
  users: createMockTable(),
  jobs: createMockTable(),
  novels: createMockTable(),
  episodes: createMockTable(),
  chunks: createMockTable(),
  outputs: createMockTable(),

  // Processing status tables
  chunkAnalysisStatus: createMockTable(),
  layoutStatus: createMockTable(),
  renderStatus: createMockTable(),
  jobStepHistory: createMockTable(),
  tokenUsage: createMockTable(),
  storageFiles: createMockTable(),

  // Authentication tables
  accounts: createMockTable(),
  sessions: createMockTable(),
  verificationTokens: createMockTable(),
  authenticators: createMockTable(),

  // Database operations
  transaction: vi.fn().mockImplementation((callback) => callback(mockDatabase)),
  select: vi.fn().mockImplementation(() => {
    const builder = createMockQueryBuilder()
    // For select operations, return a mock user when checking existence
    builder.where = vi.fn().mockImplementation(() => {
      const whereBuilder = createMockQueryBuilder()
      whereBuilder.execute = vi
        .fn()
        .mockResolvedValue([{ id: 'test-user-id', email: 'test@example.com' }])
      return whereBuilder
    })
    return builder
  }),
  insert: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  update: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  delete: vi.fn().mockImplementation(() => {
    const builder = createMockQueryBuilder()
    // For delete operations, return empty array to indicate successful deletion
    builder.where = vi.fn().mockImplementation(() => {
      const whereBuilder = createMockQueryBuilder()
      whereBuilder.execute = vi.fn().mockResolvedValue([])
      return whereBuilder
    })
    return builder
  }),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 }),
}

// Mock schema exports - note: table name is 'user' (singular) but export is 'users' (plural)
export const users = mockDatabase.users // This maps to the 'user' table in SQLite
export const jobs = mockDatabase.jobs
export const novels = mockDatabase.novels
export const episodes = mockDatabase.episodes
export const chunks = mockDatabase.chunks
export const outputs = mockDatabase.outputs
export const chunkAnalysisStatus = mockDatabase.chunkAnalysisStatus
export const layoutStatus = mockDatabase.layoutStatus
export const renderStatus = mockDatabase.renderStatus
export const jobStepHistory = mockDatabase.jobStepHistory
export const tokenUsage = mockDatabase.tokenUsage
export const storageFiles = mockDatabase.storageFiles
export const accounts = mockDatabase.accounts
export const sessions = mockDatabase.sessions
export const verificationTokens = mockDatabase.verificationTokens
export const authenticators = mockDatabase.authenticators

// Also export as 'user' for compatibility with actual table name
export const user = mockDatabase.users

// Mock database functions
export const getDatabase = vi.fn().mockReturnValue(mockDatabase)
// Align mock behavior with real implementation for deterministic unit tests
export const shouldRunMigrations = vi.fn((env: NodeJS.ProcessEnv = process.env): boolean => {
  const skipMigrate = env?.DB_SKIP_MIGRATE === '1'
  if (skipMigrate) return false
  const nodeEnv = env?.NODE_ENV
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test'
  const isVitest = Boolean(env?.VITEST)
  return isDevOrTest || isVitest
})

// Mock schema object
export const schema = {
  users,
  jobs,
  novels,
  episodes,
  chunks,
  outputs,
  chunkAnalysisStatus,
  layoutStatus,
  renderStatus,
  jobStepHistory,
  tokenUsage,
  storageFiles,
  accounts,
  sessions,
  verificationTokens,
  authenticators,
}

// Default export for compatibility
export default mockDatabase
