/**
 * Simple Email Notification Integration Tests
 *
 * Tests email notification functionality with mock services
 */

import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jobs, novels, users } from '@/db/schema'
import { EmailService } from '@/services/email'
import {
  createTestJob,
  createTestNovel,
  createTestUser,
  getTestDatabase,
  resetTestDatabase,
} from './helpers/test-database'
import { createMockEmailServiceLayer, MockEmailService } from './helpers/test-email'

describe('Simple Email Notification Integration Tests', () => {
  const db = getTestDatabase()
  let mockEmailService: MockEmailService

  beforeEach(() => {
    resetTestDatabase()
    mockEmailService = new MockEmailService()
  })

  afterEach(() => {
    resetTestDatabase()
    mockEmailService.reset()
  })

  describe('Email Service Integration', () => {
    it('should send basic email notification', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      const testEmail = `test-${uniqueSuffix}@example.com`

      // Act: Send email using mock service
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        yield* emailService.sendEmail({
          to: testEmail,
          subject: 'Test Email',
          html: '<p>Test message</p>',
        })

        return 'success'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const result = await Effect.runPromise(program)

      // Assert: Email should be sent
      expect(result).toBe('success')
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(testEmail)).toBe(true)

      const sentEmail = mockEmailService.getLastEmail()
      expect(sentEmail.options?.to).toBe(testEmail)
      expect(sentEmail.options?.subject).toBe('Test Email')
      expect(sentEmail.options?.html).toBe('<p>Test message</p>')
    })

    it('should send job notification', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      // Act: Send job notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        yield* emailService.sendJobNotification(`user1-${uniqueSuffix}@test.com`, {
          jobId: 'test-job-123',
          status: 'completed',
        })

        return 'notification sent'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const result = await Effect.runPromise(program)

      // Assert: Notification should be sent
      expect(result).toBe('notification sent')
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(`user1-${uniqueSuffix}@test.com`)).toBe(true)

      const sentNotification = mockEmailService.getLastEmail()
      expect(sentNotification.notificationData?.data.jobId).toBe('test-job-123')
      expect(sentNotification.notificationData?.data.status).toBe('completed')
    })
  })

  describe('Email Notification Workflow', () => {
    it('should send notification based on user preferences', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // Arrange: Create user with notifications enabled
      const user = createTestUser({
        id: 'notify-user',
        email: `notify-${uniqueSuffix}@example.com`,
        emailNotifications: true,
      })

      await db.insert(users).values(user)

      // Act: Check user preferences and send notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Get user from database
        const [userFromDb] = yield* Effect.promise(() =>
          db.select().from(users).where(eq(users.id, 'notify-user')),
        )

        // Send notification only if enabled
        if (userFromDb?.emailNotifications) {
          yield* emailService.sendJobNotification(userFromDb.email!, {
            jobId: 'workflow-job',
            status: 'completed',
          })
        }

        return userFromDb
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const userResult = await Effect.runPromise(program)

      // Assert: Notification should be sent because user has notifications enabled
      expect(userResult.emailNotifications).toBe(true)
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(`notify-${uniqueSuffix}@example.com`)).toBe(true)
    })

    it('should not send notification when user has disabled notifications', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // Arrange: Create user with notifications disabled
      const user = createTestUser({
        id: 'no-notify-user',
        email: `no-notify-${uniqueSuffix}@example.com`,
        emailNotifications: false,
      })

      await db.insert(users).values(user)

      // Act: Check user preferences and conditionally send notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Get user from database
        const [userFromDb] = yield* Effect.promise(() =>
          db.select().from(users).where(eq(users.id, 'no-notify-user')),
        )

        // Send notification only if enabled
        if (userFromDb?.emailNotifications) {
          yield* emailService.sendJobNotification(userFromDb.email!, {
            jobId: 'no-notify-job',
            status: 'completed',
          })
        }

        return userFromDb
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const userResult = await Effect.runPromise(program)

      // Assert: No notification should be sent because user has notifications disabled
      expect(userResult.emailNotifications).toBe(false)
      expect(mockEmailService.sentEmails).toHaveLength(0)
    })
  })

  describe('Job Completion Email Flow', () => {
    it('should simulate complete job completion with email notification', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // Arrange: Create user, novel, and job
      const user = createTestUser({
        id: 'complete-user',
        email: `complete-${uniqueSuffix}@example.com`,
        emailNotifications: true,
      })

      const novel = createTestNovel('complete-user', {
        id: 'complete-novel',
        title: 'Complete Novel',
      })

      const job = createTestJob('complete-novel', 'complete-user', {
        id: 'complete-job',
        jobName: 'Complete Job',
        status: 'processing',
      })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)
      await db.insert(jobs).values(job)

      // Act: Complete job and send notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Update job to completed
        yield* Effect.promise(() =>
          db
            .update(jobs)
            .set({
              status: 'completed',
              completedAt: new Date().toISOString(),
            })
            .where(eq(jobs.id, 'complete-job')),
        )

        // Get user and job details
        const [userFromDb] = yield* Effect.promise(() =>
          db.select().from(users).where(eq(users.id, 'complete-user')),
        )

        const [jobFromDb] = yield* Effect.promise(() =>
          db.select().from(jobs).where(eq(jobs.id, 'complete-job')),
        )

        const [novelFromDb] = yield* Effect.promise(() =>
          db.select().from(novels).where(eq(novels.id, 'complete-novel')),
        )

        // Send completion notification
        if (userFromDb?.emailNotifications) {
          yield* emailService.sendJobNotification(userFromDb.email!, {
            jobId: jobFromDb.id,
            status: 'completed',
          })
        }

        return { user: userFromDb, job: jobFromDb, novel: novelFromDb }
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const result = await Effect.runPromise(program)

      // Assert: Job should be completed and notification sent
      expect(result.job.status).toBe('completed')
      expect(result.job.completedAt).toBeDefined()

      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(`complete-${uniqueSuffix}@example.com`)).toBe(true)

      const notification = mockEmailService.getLastEmail()
      expect(notification.notificationData?.data.status).toBe('completed')
    })

    it('should handle job failure with error notification', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // Arrange: Create user, novel, and job
      const user = createTestUser({
        id: 'error-user',
        email: `error-${uniqueSuffix}@example.com`,
        emailNotifications: true,
      })

      const novel = createTestNovel('error-user', {
        id: 'error-novel',
        title: 'Error Novel',
      })

      const job = createTestJob('error-novel', 'error-user', {
        id: 'error-job',
        jobName: 'Error Job',
        status: 'processing',
      })

      await db.insert(users).values(user)
      await db.insert(novels).values(novel)
      await db.insert(jobs).values(job)

      // Act: Fail job and send error notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        const errorMessage = 'Processing failed due to invalid input'

        // Update job to failed
        yield* Effect.promise(() =>
          db
            .update(jobs)
            .set({
              status: 'failed',
              lastError: errorMessage,
              lastErrorStep: 'analyze',
            })
            .where(eq(jobs.id, 'error-job')),
        )

        // Get user details
        const [userFromDb] = yield* Effect.promise(() =>
          db.select().from(users).where(eq(users.id, 'error-user')),
        )

        // Send error notification
        if (userFromDb?.emailNotifications) {
          yield* emailService.sendJobNotification(userFromDb.email!, {
            jobId: 'error-job',
            status: 'failed',
            errorMessage: errorMessage,
          })
        }

        return 'error handled'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const result = await Effect.runPromise(program)

      // Assert: Error notification should be sent
      expect(result).toBe('error handled')
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(`error-${uniqueSuffix}@example.com`)).toBe(true)

      const notification = mockEmailService.getLastEmail()
      expect(notification.notificationData?.data.status).toBe('failed')
      expect(notification.notificationData?.data.errorMessage).toBe(
        'Processing failed due to invalid input',
      )
    })
  })

  describe('Multiple Email Scenarios', () => {
    it('should handle multiple users with different notification preferences', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
      // ユニークなサフィックスでこのテスト専用のユーザーを作成
      const testUsers = [
        {
          id: `notify-enabled-${uniqueSuffix}`,
          name: 'Notify Enabled User',
          email: `notify-${uniqueSuffix}@example.com`,
          emailNotifications: true,
        },
        {
          id: `notify-disabled-${uniqueSuffix}`,
          name: 'Notify Disabled User',
          email: `no-notify-${uniqueSuffix}@example.com`,
          emailNotifications: false,
        },
      ]

      await db.insert(users).values(testUsers as any)

      // Act: Query only the users we created
      const allUsers = await db.select().from(users).where(eq(users.emailNotifications, true))

      // Assert: Should have exactly 1 user (enabled)
      const filteredEnabled = allUsers.filter((u) => u.id?.includes(uniqueSuffix))
      expect(filteredEnabled).toHaveLength(1)

      // Send notification only to enabled user
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService
        for (const user of filteredEnabled) {
          if (user.email) {
            yield* emailService.sendJobNotification(user.email, {
              jobId: `job-for-${user.id}`,
              status: 'completed',
            })
          }
        }
        return filteredEnabled
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const resultUsers = await Effect.runPromise(program)

      expect(resultUsers).toHaveLength(1)
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo(`notify-${uniqueSuffix}@example.com`)).toBe(true)
      expect(mockEmailService.wasEmailSentTo(`no-notify-${uniqueSuffix}@example.com`)).toBe(false)
    })
  })
})
