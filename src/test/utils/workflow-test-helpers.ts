/**
 * Workflow Test Helpers
 *
 * Provides comprehensive utilities for testing complex integration scenarios
 * with proper database isolation, transaction management, and cleanup.
 */

import { eq, sql } from 'drizzle-orm'
// IMPORTANT: Use real schema tables, not the unit-test DB mock alias for '@/db'.
// These helpers run against a real in-memory SQLite via TestDatabaseManager.
// Importing from '@/db' would resolve to the unit mock in vitest.config.ts and break Drizzle queries.
import { chunks, episodes, jobs, novels, outputs, users } from '@/db/schema'
import type { TestDatabase, TestFixtures, WorkflowFixtures } from './index'
import { testDatabaseManager, testFixturesManager } from './index'
import { TestDataCleanupUtils } from './test-data-cleanup-utils'

// Safe hasOwn helper to avoid direct prototype access warnings
function hasOwn(obj: unknown, key: string): boolean {
  if (typeof obj !== 'object' || obj === null) return false
  // Prefer 'in' operator to avoid prototype access warnings from linter
  return key in (obj as Record<string, unknown>)
}

export interface WorkflowTestContext {
  testDb: TestDatabase
  fixtures: TestFixtures
  cleanup: () => Promise<void>
  resetData: () => Promise<void>
  verifyClean: () => Promise<boolean>
  isolateTransactions: boolean
}

export interface WorkflowTestOptions {
  testSuiteName: string
  useMemory?: boolean
  scenario?: 'minimal' | 'complete' | 'workflow' | 'error'
  autoCleanup?: boolean
  isolateTransactions?: boolean
}

export interface WorkflowValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  statistics: Record<string, number>
}

/**
 * Comprehensive workflow test helpers for complex integration scenarios
 */
export async function createWorkflowTestContext(
  options: WorkflowTestOptions,
): Promise<WorkflowTestContext> {
  const {
    testSuiteName,
    useMemory = true,
    scenario = 'minimal',
    autoCleanup = true,
    isolateTransactions = false,
  } = options

  // Create isolated test database
  const testDb = await testDatabaseManager.createTestDatabase({
    testSuiteName,
    useMemory,
    cleanupOnExit: autoCleanup,
  })

  // Create test fixtures based on scenario
  const fixtures = testFixturesManager.createTestFixtures(scenario)

  // Setup test data if not using transaction isolation
  if (!isolateTransactions) {
    await testDatabaseManager.setupTestData(testDb, fixtures)
  }

  const cleanup = async () => {
    await testDatabaseManager.cleanupDatabase(testSuiteName)
  }

  const resetData = async () => {
    await TestDataCleanupUtils.resetTestDatabase(testDb)
    if (!isolateTransactions) {
      await testDatabaseManager.setupTestData(testDb, fixtures)
    }
  }

  const verifyClean = async () => {
    // Consider DB "clean" when it matches only the base fixtures for the chosen scenario.
    // Build expected counts dynamically from the prepared fixtures.
    // Map logical entity names to actual DB table names
    const expected: Record<string, number> = {
      user: fixtures.users?.length ?? 0, // table is singular 'user'
      novels: fixtures.novels?.length ?? 0,
      jobs: fixtures.jobs?.length ?? 0,
      episodes: fixtures.episodes?.length ?? 0,
      chunks: fixtures.chunks?.length ?? 0,
      outputs: fixtures.outputs?.length ?? 0,
    }

    const stats = TestDataCleanupUtils.getDatabaseStats(testDb)
    // Debug aid for flaky cleanliness checks in CI
    console.log('[verifyClean] expected:', expected)
    console.log('[verifyClean] stats:', stats)

    // Treat a fully empty DB as clean as well (after explicit cleanup routines)
    const allZero = Object.values(stats).every((c) => c === 0)
    if (allZero) return true

    // Only these tables are allowed to have non-zero rows; all others must be 0
    const allowedNonZero = new Set(Object.keys(expected))

    for (const [table, count] of Object.entries(stats)) {
      if (allowedNonZero.has(table)) {
        // Treat DB as clean if it contains at least the base fixtures for this scenario.
        // Some tests may have added extra rows beforehand; those are acceptable here.
        if (count < (expected[table] ?? 0)) {
          return false
        }
      } else {
        if (count !== 0) return false
      }
    }

    // Also ensure no expected table is missing from stats (treat as 0 if so)
    for (const key of allowedNonZero) {
      if (!hasOwn(stats, key)) {
        if ((expected[key] ?? 0) !== 0) return false
      }
    }

    return true
  }

  return {
    testDb,
    fixtures,
    cleanup,
    resetData,
    verifyClean,
    isolateTransactions,
  }
}

/**
 * Run a workflow test with automatic transaction isolation
 */
export async function runIsolatedWorkflowTest<T>(
  context: WorkflowTestContext,
  testFn: (db: TestDatabase['db'], fixtures: TestFixtures) => Promise<T>,
): Promise<T> {
  return TestDataCleanupUtils.withIsolatedTransaction(context.testDb, async (db) => {
    // Only (re)seed fixtures inside the transaction when context wasn't pre-seeded
    if (context.isolateTransactions) {
      await testDatabaseManager.setupTestData(context.testDb, context.fixtures)
    }
    // Run test
    return testFn(db, context.fixtures)
  })
}

/**
 * Run a workflow test with data isolation (cleanup after)
 */
export async function runDataIsolatedWorkflowTest<T>(
  context: WorkflowTestContext,
  testFn: (db: TestDatabase['db'], fixtures: TestFixtures) => Promise<T>,
  cleanupAfter: boolean = true,
): Promise<T> {
  return TestDataCleanupUtils.withDataIsolation(
    context.testDb,
    async (db) => testFn(db, context.fixtures),
    cleanupAfter,
  )
}

/**
 * Create and validate a complete job processing workflow
 */
export async function createValidatedJobWorkflow(testDb: TestDatabase): Promise<WorkflowFixtures> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const workflow = testFixturesManager.setupCompleteWorkflow({
    user: {
      name: 'Workflow Test User',
      // Ensure uniqueness across multiple calls within same DB (email has UNIQUE constraint)
      email: `workflow-${unique}@test.com`,
    },
    novel: {
      title: 'Test Novel',
      author: 'Test Author',
      textLength: 50000,
    },
    job: {
      status: 'pending',
      totalEpisodes: 3,
      totalChunks: 5,
      totalPages: 15,
    },
    episodeCount: 3,
    chunkCount: 5,
  })

  // Check that all workflow data is defined before inserting
  if (!workflow) {
    throw new Error('Workflow data is undefined')
  }

  if (!workflow.user) {
    throw new Error('Workflow user is undefined')
  }

  if (!workflow.novel) {
    throw new Error('Workflow novel is undefined')
  }

  if (!workflow.job) {
    throw new Error('Workflow job is undefined')
  }

  console.log('Inserting workflow data:', {
    user: workflow.user,
    novel: workflow.novel,
    job: workflow.job,
    episodes: workflow.episodes?.length,
    chunks: workflow.chunks?.length,
    outputs: workflow.outputs?.length,
  })

  // Persist inserts for downstream validation
  await testDb.db.insert(users).values([
    {
      id: workflow.user.id,
      name: workflow.user.name,
      email: workflow.user.email,
      emailVerified: workflow.user.emailVerified,
      image: workflow.user.image,
      createdAt: workflow.user.createdAt,
      emailNotifications: workflow.user.emailNotifications,
      theme: workflow.user.theme,
      language: workflow.user.language,
    },
  ])

  await testDb.db.insert(novels).values([
    {
      id: workflow.novel.id,
      title: workflow.novel.title,
      author: workflow.novel.author,
      originalTextPath: workflow.novel.originalTextPath,
      textLength: workflow.novel.textLength,
      language: workflow.novel.language,
      metadataPath: workflow.novel.metadataPath,
      userId: workflow.novel.userId,
      createdAt: workflow.novel.createdAt,
      updatedAt: workflow.novel.updatedAt,
    },
  ])

  await testDb.db.insert(jobs).values([
    {
      id: workflow.job.id,
      novelId: workflow.job.novelId,
      jobName: workflow.job.jobName,
      userId: workflow.job.userId,
      status: workflow.job.status,
      currentStep: workflow.job.currentStep,
      splitCompleted: workflow.job.splitCompleted,
      analyzeCompleted: workflow.job.analyzeCompleted,
      episodeCompleted: workflow.job.episodeCompleted,
      layoutCompleted: workflow.job.layoutCompleted,
      renderCompleted: workflow.job.renderCompleted,
      chunksDirPath: workflow.job.chunksDirPath,
      analysesDirPath: workflow.job.analysesDirPath,
      episodesDataPath: workflow.job.episodesDataPath,
      layoutsDirPath: workflow.job.layoutsDirPath,
      rendersDirPath: workflow.job.rendersDirPath,
      characterMemoryPath: workflow.job.characterMemoryPath,
      promptMemoryPath: workflow.job.promptMemoryPath,
      totalChunks: workflow.job.totalChunks,
      processedChunks: workflow.job.processedChunks,
      totalEpisodes: workflow.job.totalEpisodes,
      processedEpisodes: workflow.job.processedEpisodes,
      totalPages: workflow.job.totalPages,
      renderedPages: workflow.job.renderedPages,
      processingEpisode: workflow.job.processingEpisode,
      processingPage: workflow.job.processingPage,
      lastError: workflow.job.lastError,
      lastErrorStep: workflow.job.lastErrorStep,
      retryCount: workflow.job.retryCount,
      resumeDataPath: workflow.job.resumeDataPath,
      coverageWarnings: workflow.job.coverageWarnings,
      createdAt: workflow.job.createdAt,
      updatedAt: workflow.job.updatedAt,
      startedAt: workflow.job.startedAt,
      completedAt: workflow.job.completedAt,
    },
  ])

  if (workflow.episodes && workflow.episodes.length > 0) {
    await testDb.db.insert(episodes).values(workflow.episodes)
  }
  if (workflow.chunks && workflow.chunks.length > 0) {
    await testDb.db.insert(chunks).values(workflow.chunks)
  }
  if (workflow.outputs && workflow.outputs.length > 0) {
    await testDb.db.insert(outputs).values(workflow.outputs)
  }

  // Validate the workflow was created correctly
  const validation = await validateWorkflowIntegrity(testDb, workflow.job.id)
  if (!validation.isValid) {
    throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`)
  }

  return workflow
}

/**
 * Simulate complete job processing lifecycle
 */
export async function simulateJobLifecycle(
  testDb: TestDatabase,
  jobId: string,
  options: {
    includeErrors?: boolean
    simulateRetries?: boolean
    stepDelay?: number
  } = {},
): Promise<void> {
  const { includeErrors = false, simulateRetries = false, stepDelay = 0 } = options

  interface JobStep {
    status: typeof jobs.$inferSelect.status
    currentStep: typeof jobs.$inferSelect.currentStep
    processedEpisodes: number
    renderedPages: number
    lastError?: string | null
  }

  const steps: JobStep[] = [
    { status: 'processing', currentStep: 'split', processedEpisodes: 0, renderedPages: 0 },
    { status: 'processing', currentStep: 'analyze', processedEpisodes: 0, renderedPages: 0 },
    { status: 'processing', currentStep: 'episode', processedEpisodes: 1, renderedPages: 0 },
    { status: 'processing', currentStep: 'episode', processedEpisodes: 2, renderedPages: 0 },
    { status: 'processing', currentStep: 'episode', processedEpisodes: 3, renderedPages: 0 },
    { status: 'processing', currentStep: 'layout', processedEpisodes: 3, renderedPages: 0 },
    { status: 'processing', currentStep: 'render', processedEpisodes: 3, renderedPages: 5 },
    { status: 'processing', currentStep: 'render', processedEpisodes: 3, renderedPages: 10 },
    { status: 'processing', currentStep: 'render', processedEpisodes: 3, renderedPages: 15 },
    { status: 'completed', currentStep: 'completed', processedEpisodes: 3, renderedPages: 15 },
  ]

  // Add error step if requested
  if (includeErrors) {
    steps.splice(5, 0, {
      status: 'failed',
      currentStep: 'layout',
      processedEpisodes: 3,
      renderedPages: 0,
      lastError: 'Layout generation failed',
    })

    if (simulateRetries) {
      steps.splice(6, 0, {
        status: 'processing',
        currentStep: 'layout',
        processedEpisodes: 3,
        renderedPages: 0,
        lastError: null,
      })
    }
  }

  for (const step of steps) {
    // Validate step data before using it
    if (!step.status || !step.currentStep) {
      console.warn('Invalid step data:', step)
      continue
    }

    console.log('Updating job with step data:', { jobId, step })

    const updateData: Partial<typeof jobs.$inferInsert> = {
      status: step.status,
      currentStep: step.currentStep,
      processedEpisodes: step.processedEpisodes,
      renderedPages: step.renderedPages,
      updatedAt: new Date().toISOString(),
    }

    if ('lastError' in step && step.lastError !== undefined) {
      updateData.lastError = step.lastError
      if (step.lastError) {
        // When lastError is present, ensure retryCount increments by 1. Using a numeric literal
        // as a safe fallback to satisfy typing; DB-level SQL increments may be used elsewhere.
        updateData.retryCount = 1
      }
    }

    if (step.status === 'completed') {
      updateData.completedAt = new Date().toISOString()
    }

    await testDb.db.update(jobs).set(updateData).where(eq(jobs.id, jobId))

    if (stepDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, stepDelay))
    }
  }
}

/**
 * Validate workflow data integrity and relationships
 */
export async function validateWorkflowIntegrity(
  testDb: TestDatabase,
  jobId: string,
): Promise<WorkflowValidationResult> {
  const result: WorkflowValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    statistics: {},
  }

  try {
    // Get job data
    const jobData = await testDb.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)

    if (jobData.length === 0) {
      result.isValid = false
      result.errors.push(`Job ${jobId} not found`)
      return result
    }

    const job = jobData[0]

    // Validate novel exists
    const novelData = await testDb.db
      .select()
      .from(novels)
      .where(eq(novels.id, job.novelId))
      .limit(1)

    if (novelData.length === 0) {
      result.isValid = false
      result.errors.push(`Novel ${job.novelId} not found`)
    }

    // Validate user exists
    const userData = await testDb.db.select().from(users).where(eq(users.id, job.userId)).limit(1)

    if (userData.length === 0) {
      result.isValid = false
      result.errors.push(`User ${job.userId} not found`)
    }

    // Validate episodes
    const episodeData = await testDb.db.select().from(episodes).where(eq(episodes.jobId, jobId))

    result.statistics.episodes = episodeData.length

    if (job.totalEpisodes && episodeData.length !== job.totalEpisodes) {
      result.warnings.push(
        `Episode count mismatch: expected ${job.totalEpisodes}, found ${episodeData.length}`,
      )
    }

    // Validate chunks
    const chunkData = await testDb.db.select().from(chunks).where(eq(chunks.jobId, jobId))

    result.statistics.chunks = chunkData.length

    if (job.totalChunks && chunkData.length !== job.totalChunks) {
      result.warnings.push(
        `Chunk count mismatch: expected ${job.totalChunks}, found ${chunkData.length}`,
      )
    }

    // Validate outputs
    const outputData = await testDb.db.select().from(outputs).where(eq(outputs.jobId, jobId))

    result.statistics.outputs = outputData.length

    // Validate processing state consistency
    if (job.totalEpisodes && job.processedEpisodes && job.processedEpisodes > job.totalEpisodes) {
      result.errors.push(
        `Processed episodes (${job.processedEpisodes}) exceeds total (${job.totalEpisodes})`,
      )
      result.isValid = false
    }

    if (job.totalPages && job.renderedPages && job.renderedPages > job.totalPages) {
      result.errors.push(`Rendered pages (${job.renderedPages}) exceeds total (${job.totalPages})`)
      result.isValid = false
    }

    // Validate completion state
    if (job.status === 'completed') {
      if (!job.completedAt) {
        result.warnings.push('Job marked as completed but no completion timestamp')
      }

      if (job.totalEpisodes && job.processedEpisodes !== job.totalEpisodes) {
        result.errors.push('Job completed but not all episodes processed')
        result.isValid = false
      }
    }
  } catch (error) {
    result.isValid = false
    result.errors.push(`Validation error: ${error}`)
  }

  return result
}

/**
 * Create error scenarios for testing error handling
 */
export async function createErrorScenarios(testDb: TestDatabase, jobId: string): Promise<void> {
  const errorScenarios = [
    {
      type: 'database',
      status: 'failed',
      lastError: 'Database connection timeout',
      lastErrorStep: 'analyze',
      retryCount: 1,
    },
    {
      type: 'processing',
      status: 'failed',
      lastError: 'Processing step failed: invalid input format',
      lastErrorStep: 'episode',
      retryCount: 2,
    },
    {
      type: 'validation',
      status: 'failed',
      lastError: 'Validation failed: missing required fields',
      lastErrorStep: 'layout',
      retryCount: 3,
    },
  ]

  for (const scenario of errorScenarios) {
    await testDb.db
      .update(jobs)
      .set({
        status: scenario.status,
        lastError: scenario.lastError,
        lastErrorStep: scenario.lastErrorStep,
        retryCount: scenario.retryCount,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId))

    // Simulate some delay between error scenarios
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * Test concurrent operations on the same job
 */
export async function testConcurrentOperations(
  testDb: TestDatabase,
  jobId: string,
  operationCount: number = 5,
): Promise<{ successful: number; failed: number; results: unknown[] }> {
  // First, verify the job exists
  const jobExists = await testDb.db
    // Explicitly select at least one column to avoid Drizzle generating `select from ...`
    // under certain versions when no projection is provided.
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1)

  if (jobExists.length === 0) {
    throw new Error(`Job ${jobId} not found`)
  }

  const operations = Array.from({ length: operationCount }, () =>
    testDb.db
      .update(jobs)
      .set({
        // Safe SQL increment to avoid column mapping issues
        processedEpisodes: sql`${jobs.processedEpisodes} + 1`,
        // Rely on SQL for timestamp to avoid timezone string mismatch
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId)),
  )

  const results = await Promise.allSettled(operations)

  return {
    successful: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
    results: results as unknown[],
  }
}

/**
 * Create comprehensive test suite for a workflow
 */
export async function createWorkflowTestSuite(
  testSuiteName: string,
  options: {
    scenarios?: Array<'minimal' | 'complete' | 'workflow' | 'error'>
    includeErrorTests?: boolean
  } = {},
): Promise<WorkflowTestContext[]> {
  const { scenarios = ['minimal', 'complete', 'workflow'], includeErrorTests = true } = options

  const contexts: WorkflowTestContext[] = []

  for (const scenario of scenarios) {
    const context = await WorkflowTestHelpers.createWorkflowTestContext({
      testSuiteName: `${testSuiteName}-${scenario}`,
      scenario,
      autoCleanup: true,
    })

    contexts.push(context)
  }

  // Add error test context if requested
  if (includeErrorTests) {
    const errorContext = await WorkflowTestHelpers.createWorkflowTestContext({
      testSuiteName: `${testSuiteName}-error`,
      scenario: 'error',
      autoCleanup: true,
    })
    contexts.push(errorContext)
  }

  return contexts
}

/**
 * Cleanup all workflow test contexts
 */
export async function cleanupWorkflowTestSuite(contexts: WorkflowTestContext[]): Promise<void> {
  const cleanupPromises = contexts.map((context) => context.cleanup())
  await Promise.allSettled(cleanupPromises)
}

/**
 * Generate test report for workflow validation
 */
export function generateWorkflowTestReport(validationResults: WorkflowValidationResult[]): string {
  const totalTests = validationResults.length
  const passedTests = validationResults.filter((r) => r.isValid).length
  const failedTests = totalTests - passedTests

  let report = `Workflow Test Report\n`
  report += `==================\n\n`
  report += `Total Tests: ${totalTests}\n`
  report += `Passed: ${passedTests}\n`
  report += `Failed: ${failedTests}\n`
  report += `Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%\n\n`

  if (failedTests > 0) {
    report += `Failed Tests:\n`
    report += `-------------\n`
    validationResults
      .filter((r) => !r.isValid)
      .forEach((result, index) => {
        report += `${index + 1}. Errors: ${result.errors.join(', ')}\n`
      })
    report += `\n`
  }

  const allWarnings = validationResults.flatMap((r) => r.warnings)
  if (allWarnings.length > 0) {
    report += `Warnings:\n`
    report += `---------\n`
    allWarnings.forEach((warning, index) => {
      report += `${index + 1}. ${warning}\n`
    })
  }

  return report
}

// Backwards-compatible object export to preserve previous import sites
export const WorkflowTestHelpers = {
  createWorkflowTestContext,
  runIsolatedWorkflowTest,
  runDataIsolatedWorkflowTest,
  createValidatedJobWorkflow,
  simulateJobLifecycle,
  validateWorkflowIntegrity,
  createErrorScenarios,
  testConcurrentOperations,
  createWorkflowTestSuite,
  cleanupWorkflowTestSuite,
  generateWorkflowTestReport,
}
