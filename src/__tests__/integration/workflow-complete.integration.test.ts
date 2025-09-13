/**
 * Complete Workflow Integration Test
 *
 * Tests end-to-end workflow processing with proper database isolation
 * and transaction management using the updated integration test infrastructure.
 */

import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chunks, episodes, jobs, novels, users } from '@/db'
import type { WorkflowTestContext } from '../../test/helpers/integration-test-helpers'
import {
  createConcurrentTestScenario,
  createErrorScenario,
  createJobProcessingWorkflow,
  createWorkflowTestContext,
  runWorkflowTest,
  simulateJobProgression,
  verifyDatabaseConstraints,
  verifyJobCompletion,
} from '../../test/helpers/integration-test-helpers'

describe('Complete Workflow Integration', () => {
  let context: WorkflowTestContext

  beforeAll(async () => {
    context = await createWorkflowTestContext({
      testSuiteName: 'workflow-complete-integration',
      useMemory: true,
      scenario: 'complete',
    })
  })

  afterAll(async () => {
    await context.cleanup()
  })

  describe('Job Processing Workflow', () => {
    it('should process a complete job workflow from start to finish', async () => {
      await runWorkflowTest(context, async (db) => {
        // Create a complete workflow
        const workflow = await createJobProcessingWorkflow(context.testDb)

        // Verify initial state
        expect(workflow.job.status).toBe('pending')
        expect(workflow.job.currentStep).toBe('initialized')
        expect(workflow.episodes).toHaveLength(3)
        expect(workflow.chunks).toHaveLength(5)

        // Simulate job progression through all steps
        await simulateJobProgression(context.testDb, workflow.job.id, [
          { status: 'processing', currentStep: 'split' },
          { status: 'processing', currentStep: 'analyze' },
          { status: 'processing', currentStep: 'episode', processedEpisodes: 1 },
          { status: 'processing', currentStep: 'episode', processedEpisodes: 2 },
          { status: 'processing', currentStep: 'episode', processedEpisodes: 3 },
          { status: 'processing', currentStep: 'layout' },
          { status: 'processing', currentStep: 'render', renderedPages: 5 },
          { status: 'processing', currentStep: 'render', renderedPages: 10 },
          { status: 'completed', currentStep: 'finished', processedEpisodes: 3, renderedPages: 15 },
        ])

        // Verify completion
        const completion = await verifyJobCompletion(context.testDb, workflow.job.id)
        expect(completion.isCompleted).toBe(true)
        expect(completion.hasAllEpisodes).toBe(true)
        expect(completion.hasCompletionTime).toBe(true)
      })
    })

    it('should handle job failure and recovery scenarios', async () => {
      await runWorkflowTest(context, async (db) => {
        // Create workflow
        const workflow = await createJobProcessingWorkflow(context.testDb)

        // Simulate failure
        await createErrorScenario(context.testDb, workflow.job.id, 'processing')

        // Verify error state
        const failedJob = await db.select().from(jobs).where(eq(jobs.id, workflow.job.id)).limit(1)

        expect(failedJob[0].status).toBe('failed')
        expect(failedJob[0].lastError).toBe('Processing step failed')
        expect(failedJob[0].retryCount).toBe(3)

        // Simulate recovery
        await simulateJobProgression(context.testDb, workflow.job.id, [
          { status: 'pending', currentStep: 'analyze', lastError: null },
          { status: 'completed', currentStep: 'finished', processedEpisodes: 3, renderedPages: 15 },
        ])

        // Verify recovery
        const recoveredJob = await db
          .select()
          .from(jobs)
          .where(eq(jobs.id, workflow.job.id))
          .limit(1)

        expect(recoveredJob[0].status).toBe('completed')
        expect(recoveredJob[0].lastError).toBeNull()
      })
    })

    it('should maintain data integrity across workflow steps', async () => {
      await runWorkflowTest(context, async (db) => {
        // Create workflow
        const workflow = await createJobProcessingWorkflow(context.testDb)

        // Verify all relationships exist
        const userWithNovels = await db
          .select()
          .from(users)
          .leftJoin(novels, eq(users.id, novels.userId))
          .where(eq(users.id, workflow.user.id))

        expect(userWithNovels).toHaveLength(1)
        expect(userWithNovels[0].novels?.title).toBe('Test Novel')

        const jobWithEpisodes = await db
          .select()
          .from(jobs)
          .leftJoin(episodes, eq(jobs.id, episodes.jobId))
          .where(eq(jobs.id, workflow.job.id))

        expect(jobWithEpisodes).toHaveLength(3) // 3 episodes
        expect(jobWithEpisodes.every((row) => row.episodes?.jobId === workflow.job.id)).toBe(true)

        const jobWithChunks = await db
          .select()
          .from(jobs)
          .leftJoin(chunks, eq(jobs.id, chunks.jobId))
          .where(eq(jobs.id, workflow.job.id))

        expect(jobWithChunks).toHaveLength(5) // 5 chunks
        expect(jobWithChunks.every((row) => row.chunks?.jobId === workflow.job.id)).toBe(true)
      })
    })
  })

  describe('Database Constraints and Isolation', () => {
    it('should enforce foreign key constraints', async () => {
      await runWorkflowTest(context, async (db) => {
        // Try to create job with invalid novel ID
        const invalidJob = {
          id: 'invalid-job-id',
          novelId: 'nonexistent-novel-id',
          userId: context.fixtures.users![0].id,
          status: 'pending',
          currentStep: 'initialized',
          totalChunks: 0,
          processedChunks: 0,
          totalEpisodes: 0,
          processedEpisodes: 0,
          totalPages: 0,
          renderedPages: 0,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // Should fail due to foreign key constraint
        await expect(db.insert(jobs).values(invalidJob)).rejects.toThrow()
      })
    })

    it('should maintain transaction isolation between tests', async () => {
      // First transaction
      await runWorkflowTest(context, async (db) => {
        const testUser = {
          id: 'transaction-test-user-1',
          name: 'Transaction Test User 1',
          email: 'transaction1@test.com',
          createdAt: new Date().toISOString(),
        }

        await db.insert(users).values(testUser)

        const userResults = await db.select().from(users).where(eq(users.id, testUser.id))
        expect(userResults).toHaveLength(1)
      })

      // Second transaction (should not see data from first)
      await runWorkflowTest(context, async (db) => {
        const userResults = await db
          .select()
          .from(users)
          .where(eq(users.id, 'transaction-test-user-1'))
        expect(userResults).toHaveLength(0) // Should be isolated
      })
    })

    it('should verify database constraints and relationships', async () => {
      await runWorkflowTest(context, async () => {
        const constraints = await verifyDatabaseConstraints(context.testDb)

        expect(constraints.foreignKeyConstraints).toBe(true)
        expect(constraints.uniqueConstraints).toBe(true)
        expect(constraints.dataIntegrity).toBe(true)
        expect(constraints.errors).toHaveLength(0)
      })
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent job updates properly', async () => {
      await runWorkflowTest(context, async (db) => {
        // Create a job for concurrent testing
        const workflow = await createJobProcessingWorkflow(context.testDb)

        // Test concurrent operations
        const concurrentResult = await createConcurrentTestScenario(
          context.testDb,
          workflow.job.id,
          5,
        )

        // At least some operations should succeed
        expect(concurrentResult.successful).toBeGreaterThan(0)

        // Verify final state is consistent
        const finalJob = await db.select().from(jobs).where(eq(jobs.id, workflow.job.id)).limit(1)

        expect(finalJob[0].processedEpisodes).toBeGreaterThan(0)
        expect(finalJob[0].processedEpisodes).toBeLessThanOrEqual(5)
      })
    })
  })

  describe('Complex Query Operations', () => {
    it('should perform complex aggregation queries correctly', async () => {
      await runWorkflowTest(context, async (db) => {
        // Create multiple jobs with different statuses
        const testUser = context.fixtures.users![0]
        const testNovel = context.fixtures.novels![0]

        const additionalJobs = [
          {
            id: 'job-completed',
            novelId: testNovel.id,
            userId: testUser.id,
            status: 'completed',
            currentStep: 'finished',
            totalChunks: 10,
            processedChunks: 10,
            totalEpisodes: 5,
            processedEpisodes: 5,
            totalPages: 20,
            renderedPages: 20,
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'job-processing',
            novelId: testNovel.id,
            userId: testUser.id,
            status: 'processing',
            currentStep: 'render',
            totalChunks: 8,
            processedChunks: 6,
            totalEpisodes: 4,
            processedEpisodes: 3,
            totalPages: 16,
            renderedPages: 12,
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'job-failed',
            novelId: testNovel.id,
            userId: testUser.id,
            status: 'failed',
            currentStep: 'analyze',
            totalChunks: 5,
            processedChunks: 2,
            totalEpisodes: 3,
            processedEpisodes: 0,
            totalPages: 12,
            renderedPages: 0,
            retryCount: 3,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]

        await db.insert(jobs).values(additionalJobs)

        // Query all jobs for this novel to verify they were inserted
        const allJobs = await db.select().from(jobs).where(eq(jobs.novelId, testNovel.id))

        // Should have at least our 3 additional jobs (plus any from fixtures)
        expect(allJobs.length).toBeGreaterThanOrEqual(3)

        // Verify we have jobs with different statuses
        const statuses = [...new Set(allJobs.map((job) => job.status))]
        expect(statuses.length).toBeGreaterThanOrEqual(2) // At least 2 different statuses

        // Verify specific jobs exist
        const completedJobs = allJobs.filter((job) => job.status === 'completed')
        const processingJobs = allJobs.filter((job) => job.status === 'processing')
        const failedJobs = allJobs.filter((job) => job.status === 'failed')

        expect(completedJobs.length).toBeGreaterThanOrEqual(1)
        expect(processingJobs.length).toBeGreaterThanOrEqual(1)
        expect(failedJobs.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('should handle bulk operations efficiently', async () => {
      await runWorkflowTest(context, async (db) => {
        const testUser = context.fixtures.users![0]
        const testNovel = context.fixtures.novels![0]
        const testJob = context.fixtures.jobs![0]

        // Create bulk chunks
        const bulkChunks = Array.from({ length: 50 }, (_, i) => ({
          id: `bulk-chunk-${i}`,
          novelId: testNovel.id,
          jobId: testJob.id,
          chunkIndex: i,
          contentPath: `/test/chunks/chunk-${i}.txt`,
          startPosition: i * 1000,
          endPosition: (i + 1) * 1000,
          wordCount: 200,
          createdAt: new Date().toISOString(),
        }))

        const startTime = Date.now()

        // Bulk insert
        await db.insert(chunks).values(bulkChunks)

        const insertTime = Date.now() - startTime

        // Verify all chunks were inserted
        const insertedChunks = await db.select().from(chunks).where(eq(chunks.jobId, testJob.id))

        expect(insertedChunks.length).toBeGreaterThanOrEqual(50)

        // Performance assertion (should complete within reasonable time)
        expect(insertTime).toBeLessThan(2000) // Less than 2 seconds
      })
    })
  })
})
