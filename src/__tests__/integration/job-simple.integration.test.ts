/**
 * Simple Job Management Integration Tests
 *
 * Tests job management operations with database transactions
 */

import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jobs, novels, users } from '@/db/schema'
import {
  createTestJob,
  createTestNovel,
  createTestUser,
  getTestDatabase,
  resetTestDatabase,
} from './helpers/test-database'

describe('Simple Job Management Integration Tests', () => {
  const db = getTestDatabase()

  beforeEach(() => {
    resetTestDatabase()
  })

  afterEach(() => {
    resetTestDatabase()
  })

  describe('Job Creation and Retrieval', () => {
    it('should create job with user and novel associations', async () => {
      // Arrange: Create user and novel
      const user = createTestUser({ id: 'job-user-1' })
      const novel = createTestNovel('job-user-1', { id: 'job-novel-1' })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)

      // Act: Create job
      const job = createTestJob('job-novel-1', 'job-user-1', {
        id: 'job-1',
        jobName: 'Test Job 1',
        status: 'pending',
      })

      await db.insert(jobs).values(job)

      // Assert: Job should be created with correct associations
      const [createdJob] = await db.select().from(jobs).where(eq(jobs.id, 'job-1'))

      expect(createdJob).toBeDefined()
      expect(createdJob.id).toBe('job-1')
      expect(createdJob.userId).toBe('job-user-1')
      expect(createdJob.novelId).toBe('job-novel-1')
      expect(createdJob.status).toBe('pending')
    })

    it('should retrieve jobs for specific user only', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      // Arrange: Create two users with their own jobs
      const user1 = createTestUser({ id: 'user-1', email: `user1-${uniqueSuffix}@example.com` })
      const user2 = createTestUser({ id: 'user-2', email: `user2-${uniqueSuffix}@example.com` })

      await db.insert(users).values([user1, user2])

      const novel1 = createTestNovel('user-1', { id: 'novel-1' })
      const novel2 = createTestNovel('user-2', { id: 'novel-2' })

      await db.insert(novels).values([novel1, novel2])

      const job1 = createTestJob('novel-1', 'user-1', { id: 'job-1' })
      const job2 = createTestJob('novel-2', 'user-2', { id: 'job-2' })

      await db.insert(jobs).values([job1, job2])

      // Act: Get jobs for user-1 only
      const user1Jobs = await db.select().from(jobs).where(eq(jobs.userId, 'user-1'))

      // Assert: Should only return user-1's jobs
      expect(user1Jobs).toHaveLength(1)
      expect(user1Jobs[0].id).toBe('job-1')
      expect(user1Jobs[0].userId).toBe('user-1')
    })
  })

  describe('Job Status Management', () => {
    it('should update job status and track progress', async () => {
      // Arrange: Create user, novel, and job
      const user = createTestUser({ id: 'status-user' })
      const novel = createTestNovel('status-user', { id: 'status-novel' })
      const job = createTestJob('status-novel', 'status-user', {
        id: 'status-job',
        status: 'pending',
        totalChunks: 10,
        processedChunks: 0,
      })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)
      await db.insert(jobs).values(job)

      // Act: Update job status and progress
      await db
        .update(jobs)
        .set({
          status: 'processing',
          processedChunks: 5,
          startedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, 'status-job'))

      // Assert: Job should be updated
      const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, 'status-job'))

      expect(updatedJob.status).toBe('processing')
      expect(updatedJob.processedChunks).toBe(5)
      expect(updatedJob.startedAt).toBeDefined()
    })

    it('should handle job completion', async () => {
      // Arrange: Create processing job
      const user = createTestUser({ id: 'complete-user' })
      const novel = createTestNovel('complete-user', { id: 'complete-novel' })
      const job = createTestJob('complete-novel', 'complete-user', {
        id: 'complete-job',
        status: 'processing',
        totalChunks: 5,
        processedChunks: 3,
      })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)
      await db.insert(jobs).values(job)

      // Act: Complete the job
      await db
        .update(jobs)
        .set({
          status: 'completed',
          processedChunks: 5,
          completedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, 'complete-job'))

      // Assert: Job should be completed
      const [completedJob] = await db.select().from(jobs).where(eq(jobs.id, 'complete-job'))

      expect(completedJob.status).toBe('completed')
      expect(completedJob.processedChunks).toBe(5)
      expect(completedJob.completedAt).toBeDefined()
    })

    it('should handle job failures with error tracking', async () => {
      // Arrange: Create processing job
      const user = createTestUser({ id: 'fail-user' })
      const novel = createTestNovel('fail-user', { id: 'fail-novel' })
      const job = createTestJob('fail-novel', 'fail-user', {
        id: 'fail-job',
        status: 'processing',
        retryCount: 0,
      })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)
      await db.insert(jobs).values(job)

      // Act: Fail the job
      await db
        .update(jobs)
        .set({
          status: 'failed',
          lastError: 'Processing failed due to invalid input',
          lastErrorStep: 'analyze',
          retryCount: 1,
        })
        .where(eq(jobs.id, 'fail-job'))

      // Assert: Job should be marked as failed with error details
      const [failedJob] = await db.select().from(jobs).where(eq(jobs.id, 'fail-job'))

      expect(failedJob.status).toBe('failed')
      expect(failedJob.lastError).toBe('Processing failed due to invalid input')
      expect(failedJob.lastErrorStep).toBe('analyze')
      expect(failedJob.retryCount).toBe(1)
    })
  })

  describe('Job Queries and Filtering', () => {
    it('should filter jobs by status', async () => {
      // Arrange: Create user and multiple jobs with different statuses
      const user = createTestUser({ id: 'filter-user' })
      const novel = createTestNovel('filter-user', { id: 'filter-novel' })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)

      const jobs_data = [
        createTestJob('filter-novel', 'filter-user', { id: 'job-pending', status: 'pending' }),
        createTestJob('filter-novel', 'filter-user', {
          id: 'job-processing',
          status: 'processing',
        }),
        createTestJob('filter-novel', 'filter-user', { id: 'job-completed', status: 'completed' }),
        createTestJob('filter-novel', 'filter-user', { id: 'job-failed', status: 'failed' }),
      ]

      await db.insert(jobs).values(jobs_data)

      // Act: Query jobs by different statuses
      const pendingJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.userId, 'filter-user'), eq(jobs.status, 'pending')))

      const completedJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.userId, 'filter-user'), eq(jobs.status, 'completed')))

      // Assert: Should return correct filtered results
      expect(pendingJobs).toHaveLength(1)
      expect(pendingJobs[0].id).toBe('job-pending')

      expect(completedJobs).toHaveLength(1)
      expect(completedJobs[0].id).toBe('job-completed')
    })

    it('should support job pagination', async () => {
      // Arrange: Create user and multiple jobs
      const user = createTestUser({ id: 'page-user' })
      const novel = createTestNovel('page-user', { id: 'page-novel' })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)

      const jobs_data = Array.from({ length: 5 }, (_, i) =>
        createTestJob('page-novel', 'page-user', {
          id: `page-job-${i + 1}`,
          jobName: `Job ${i + 1}`,
        }),
      )

      await db.insert(jobs).values(jobs_data)

      // Act: Query with pagination
      const firstPage = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, 'page-user'))
        .limit(2)
        .offset(0)

      const secondPage = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, 'page-user'))
        .limit(2)
        .offset(2)

      // Assert: Should return paginated results
      expect(firstPage).toHaveLength(2)
      expect(secondPage).toHaveLength(2)

      // Ensure different jobs in each page
      const firstPageIds = firstPage.map((j) => j.id)
      const secondPageIds = secondPage.map((j) => j.id)

      expect(firstPageIds).not.toEqual(secondPageIds)
    })
  })

  describe('User Data Isolation for Jobs', () => {
    it('should prevent access to other users jobs', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // Arrange: Create two users with jobs
      const user1 = createTestUser({
        id: 'isolated-user-1',
        email: `isolated1-${uniqueSuffix}@example.com`,
      })
      const user2 = createTestUser({
        id: 'isolated-user-2',
        email: `isolated2-${uniqueSuffix}@example.com`,
      })

      await db.insert(users).values([user1, user2])

      const novel1 = createTestNovel('isolated-user-1', { id: 'isolated-novel-1' })
      const novel2 = createTestNovel('isolated-user-2', { id: 'isolated-novel-2' })

      await db.insert(novels).values([novel1, novel2])

      const job1 = createTestJob('isolated-novel-1', 'isolated-user-1', { id: 'isolated-job-1' })
      const job2 = createTestJob('isolated-novel-2', 'isolated-user-2', { id: 'isolated-job-2' })

      await db.insert(jobs).values([job1, job2])

      // Act: Try to access specific job as different user
      const user1AccessToJob2 = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, 'isolated-job-2'), eq(jobs.userId, 'isolated-user-1')))

      const user2AccessToJob1 = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, 'isolated-job-1'), eq(jobs.userId, 'isolated-user-2')))

      // Assert: Should not be able to access other user's jobs
      expect(user1AccessToJob2).toHaveLength(0)
      expect(user2AccessToJob1).toHaveLength(0)
    })
  })
})
