/**
 * Integration Test Helpers
 *
 * Provides utilities for end-to-end workflow testing with proper
 * database isolation and transaction management.
 */

import { eq, sql } from 'drizzle-orm'
import { chunks, episodes, jobs, novels, users } from '@/db/schema'
import { cleanupTestDb, createTestDb, type TestDbHandle } from '@/test/utils/simple-test-db'
import type { TestFixtures } from '../utils'
import { testFixturesManager } from '../utils'

// Local TestDatabase contract for this helper (decoupled from removed TestDatabaseManager)
export interface TestDatabase {
  db: TestDbHandle['db']
  sqlite: TestDbHandle['sqlite']
  config: { testSuiteName: string; useMemory?: boolean }
}

export interface WorkflowTestContext {
  testDb: TestDatabase
  fixtures: TestFixtures
  cleanup: () => Promise<void>
}

export interface WorkflowTestOptions {
  testSuiteName: string
  useMemory?: boolean
  scenario?: 'minimal' | 'complete' | 'workflow' | 'error'
}

/**
 * Create an isolated workflow test environment
 */
export async function createWorkflowTestContext(
  options: WorkflowTestOptions,
): Promise<WorkflowTestContext> {
  const { testSuiteName, useMemory = true, scenario = 'minimal' } = options

  // simple-test-db を使用して独立DBを作成
  const handle = createTestDb()
  const testDb: TestDatabase = {
    ...handle,
    config: { testSuiteName, useMemory },
  }

  // シナリオに基づくフィクスチャ生成
  const fixtures = testFixturesManager.createTestFixtures(scenario)

  // 外部キー制約順でシード
  if (fixtures.users) {
    for (const user of fixtures.users) {
      await testDb.db.insert(users).values(user).onConflictDoNothing()
    }
  }
  if (fixtures.novels) {
    for (const novel of fixtures.novels) {
      await testDb.db.insert(novels).values(novel)
    }
  }
  if (fixtures.jobs) {
    for (const job of fixtures.jobs) {
      await testDb.db.insert(jobs).values(job)
    }
  }
  if (fixtures.episodes) {
    for (const episode of fixtures.episodes) {
      await testDb.db.insert(episodes).values(episode)
    }
  }
  if (fixtures.chunks) {
    for (const chunk of fixtures.chunks) {
      await testDb.db.insert(chunks).values(chunk)
    }
  }

  const cleanup = async () => {
    cleanupTestDb(handle)
  }

  return { testDb, fixtures, cleanup }
}

/**
 * Run a test within a transaction that automatically rolls back
 */
export async function runWorkflowTest<T>(
  context: WorkflowTestContext,
  testFn: (db: TestDatabase['db'], fixtures: TestFixtures) => Promise<T>,
): Promise<T> {
  // 手動トランザクションでテストを隔離（ロールバック）
  const { sqlite, db } = context.testDb
  sqlite.exec('BEGIN')
  try {
    return await testFn(db, context.fixtures)
  } finally {
    // 常にロールバックしてデータを元に戻す
    sqlite.exec('ROLLBACK')
  }
}

/**
 * Create a complete job processing workflow for testing
 */
export async function createJobProcessingWorkflow(testDb: TestDatabase) {
  const workflow = testFixturesManager.setupCompleteWorkflow({
    user: { name: 'Workflow Test User', email: 'workflow@test.com' },
    novel: { title: 'Test Novel', author: 'Test Author' },
    episodeCount: 3,
    chunkCount: 5,
  })

  // Insert all workflow data
  await testDb.db.insert(users).values(workflow.user)
  await testDb.db.insert(novels).values(workflow.novel)
  await testDb.db.insert(jobs).values(workflow.job)
  await testDb.db.insert(episodes).values(workflow.episodes)
  await testDb.db.insert(chunks).values(workflow.chunks)

  return workflow
}

/**
 * Simulate job status progression for testing
 */
export async function simulateJobProgression(
  testDb: TestDatabase,
  jobId: string,
  steps: Array<{
    status: string
    currentStep: string
    processedEpisodes?: number
    renderedPages?: number
    lastError?: string | null
  }>,
) {
  for (const step of steps) {
    const updateData: Partial<typeof jobs.$inferInsert> = {
      status: step.status,
      currentStep: step.currentStep,
      processedEpisodes: step.processedEpisodes,
      renderedPages: step.renderedPages,
      lastError: step.lastError,
      updatedAt: new Date().toISOString(),
    }

    // Set completedAt when job is completed
    if (step.status === 'completed') {
      updateData.completedAt = new Date().toISOString()
    }

    await testDb.db.update(jobs).set(updateData).where(eq(jobs.id, jobId))
  }
}

/**
 * Verify job completion state
 */
export async function verifyJobCompletion(testDb: TestDatabase, jobId: string) {
  const job = await testDb.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)

  if (job.length === 0) {
    throw new Error(`Job ${jobId} not found`)
  }

  const jobData = job[0]

  return {
    isCompleted: jobData.status === 'completed',
    hasAllEpisodes: jobData.processedEpisodes === jobData.totalEpisodes,
    hasAllPages: jobData.renderedPages === jobData.totalPages,
    hasCompletionTime: !!jobData.completedAt,
    job: jobData,
  }
}

/**
 * Create error scenario for testing error handling
 */
export async function createErrorScenario(
  testDb: TestDatabase,
  jobId: string,
  errorType: 'database' | 'processing' | 'validation',
) {
  const errorMessages = {
    database: 'Database connection failed',
    processing: 'Processing step failed',
    validation: 'Validation error occurred',
  }

  await testDb.db
    .update(jobs)
    .set({
      status: 'failed',
      lastError: errorMessages[errorType],
      lastErrorStep: 'test-step',
      retryCount: 3,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
}

/**
 * Verify database constraints and relationships
 */
export async function verifyDatabaseConstraints(testDb: TestDatabase) {
  const results = {
    foreignKeyConstraints: true,
    uniqueConstraints: true,
    dataIntegrity: true,
    errors: [] as string[],
  }

  try {
    // Test foreign key constraints
    const orphanedJobs = await testDb.db
      .select()
      .from(jobs)
      .leftJoin(novels, eq(jobs.novelId, novels.id))
      .where(sql`${novels.id} IS NULL`)

    if (orphanedJobs.length > 0) {
      results.foreignKeyConstraints = false
      results.errors.push(`Found ${orphanedJobs.length} orphaned jobs`)
    }

    // Test unique constraints
    const duplicateEmails = await testDb.db
      .select({ email: users.email, count: sql`COUNT(*)` })
      .from(users)
      .groupBy(users.email)
      .having(sql`COUNT(*) > 1`)

    if (duplicateEmails.length > 0) {
      results.uniqueConstraints = false
      results.errors.push(
        `Found duplicate emails: ${duplicateEmails.map((d) => d.email).join(', ')}`,
      )
    }

    // Test data integrity
    const jobsWithInvalidEpisodeCounts = await testDb.db
      .select()
      .from(jobs)
      .where(sql`processed_episodes > total_episodes`)

    if (jobsWithInvalidEpisodeCounts.length > 0) {
      results.dataIntegrity = false
      results.errors.push(`Found jobs with invalid episode counts`)
    }
  } catch (error) {
    results.foreignKeyConstraints = false
    results.uniqueConstraints = false
    results.dataIntegrity = false
    results.errors.push(`Constraint verification failed: ${error}`)
  }

  return results
}

/**
 * Create concurrent test scenario for testing database locking
 */
export async function createConcurrentTestScenario(
  testDb: TestDatabase,
  jobId: string,
  concurrentOperations: number = 3,
) {
  const operations = Array.from({ length: concurrentOperations }, (_, i) =>
    testDb.db
      .update(jobs)
      .set({
        processedEpisodes: i + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId)),
  )

  // Execute operations concurrently
  const results = await Promise.allSettled(operations)

  return {
    successful: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    results,
  }
}

/**
 * Setup integration test data with relationships
 */
export async function setupIntegrationTestData(
  testDb: TestDatabase,
  scenario: 'simple' | 'complex' | 'error',
) {
  switch (scenario) {
    case 'simple':
      return setupSimpleTestData(testDb)
    case 'complex':
      return setupComplexTestData(testDb)
    case 'error':
      return setupErrorTestData(testDb)
    default:
      throw new Error(`Unknown scenario: ${scenario}`)
  }
}

async function setupSimpleTestData(testDb: TestDatabase) {
  const testUser = testFixturesManager.createUser({
    name: 'Simple Test User',
    email: 'simple@test.com',
  })

  const testNovel = testFixturesManager.createNovel(testUser.id, {
    title: 'Simple Test Novel',
  })

  const testJob = testFixturesManager.createJob(testNovel.id, testUser.id, {
    status: 'pending',
  })

  await testDb.db.insert(users).values(testUser)
  await testDb.db.insert(novels).values(testNovel)
  await testDb.db.insert(jobs).values(testJob)

  return { user: testUser, novel: testNovel, job: testJob }
}

async function setupComplexTestData(testDb: TestDatabase) {
  const workflow = testFixturesManager.setupCompleteWorkflow({
    user: { name: 'Complex Test User', email: 'complex@test.com' },
    novel: { title: 'Complex Test Novel' },
    episodeCount: 5,
    chunkCount: 10,
  })

  await testDb.db.insert(users).values(workflow.user)
  await testDb.db.insert(novels).values(workflow.novel)
  await testDb.db.insert(jobs).values(workflow.job)
  await testDb.db.insert(episodes).values(workflow.episodes)
  await testDb.db.insert(chunks).values(workflow.chunks)

  return workflow
}

async function setupErrorTestData(testDb: TestDatabase) {
  const fixtures = testFixturesManager.createErrorScenarioFixtures()

  // ここでも手動でシード
  if (fixtures.users) {
    for (const user of fixtures.users) {
      await testDb.db.insert(users).values(user).onConflictDoNothing()
    }
  }
  if (fixtures.novels) {
    for (const novel of fixtures.novels) {
      await testDb.db.insert(novels).values(novel)
    }
  }
  if (fixtures.jobs) {
    for (const job of fixtures.jobs) {
      await testDb.db.insert(jobs).values(job)
    }
  }

  return fixtures
}
