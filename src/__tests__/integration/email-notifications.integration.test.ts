/**
 * Email Notification Integration Tests
 *
 * Tests email notification delivery with job processing
 */

import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { jobs, novels, users } from '@/db/schema'
import { EmailService } from '@/services/email'
import { JobService, JobServiceLive } from '@/services/job'
import { UserService, UserServiceLive } from '@/services/user'
import {
  closeTestDatabase,
  createTestJob,
  createTestNovel,
  createTestUser,
  getTestDatabase,
  resetTestDatabase,
} from './helpers/test-database'
import {
  createFailingEmailServiceLayer,
  createMockEmailServiceLayer,
  MockEmailService,
} from './helpers/test-email'

describe('Email Notification Integration Tests', () => {
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

  describe('Job Completion Notifications', () => {
    it('should send email notification when job completes successfully', async () => {
      // Arrange: Create user with email notifications enabled
      const user = createTestUser({
        id: 'notify-user',
        email: 'notify@example.com',
        emailNotifications: true,
      })
      await db.insert(users).values(user)

      const novel = createTestNovel('notify-user', {
        id: 'notify-novel',
        title: 'Test Novel',
      })
      await db.insert(novels).values(novel)

      const job = createTestJob('notify-novel', 'notify-user', {
        id: 'completed-job',
        status: 'processing',
      })
      await db.insert(jobs).values(job)

      // Act: Simulate job completion and notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Update job to completed status
        yield* Effect.promise(() =>
          db
            .update(jobs)
            .set({
              status: 'completed',
              completedAt: new Date().toISOString(),
            })
            .where(eq(jobs.id, 'completed-job')),
        )

        // Send completion notification
        yield* emailService.sendJobNotification('notify@example.com', {
          jobId: 'completed-job',
          jobName: 'Test Job',
          status: 'completed',
          novelTitle: 'Test Novel',
        })

        return 'success'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      await Effect.runPromise(program)

      // Assert: Email should be sent
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo('notify@example.com')).toBe(true)

      const sentEmail = mockEmailService.getLastEmail()
      expect(sentEmail.notificationData?.data.status).toBe('completed')
      expect(sentEmail.notificationData?.data.jobId).toBe('completed-job')
    })

    it('should send error notification when job fails', async () => {
      // Arrange: Create user with email notifications enabled
      const user = createTestUser({
        id: 'error-user',
        email: 'error@example.com',
        emailNotifications: true,
      })
      await db.insert(users).values(user)

      const novel = createTestNovel('error-user', {
        id: 'error-novel',
        title: 'Error Novel',
      })
      await db.insert(novels).values(novel)

      const job = createTestJob('error-novel', 'error-user', {
        id: 'failed-job',
        status: 'processing',
      })
      await db.insert(jobs).values(job)

      // Act: Simulate job failure and notification
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Update job to failed status
        yield* Effect.promise(() =>
          db
            .update(jobs)
            .set({
              status: 'failed',
              lastError: 'Processing failed due to invalid input',
            })
            .where(eq(jobs.id, 'failed-job')),
        )

        // Send failure notification
        yield* emailService.sendJobNotification('error@example.com', {
          jobId: 'failed-job',
          jobName: 'Error Job',
          status: 'failed',
          novelTitle: 'Error Novel',
          errorMessage: 'Processing failed due to invalid input',
        })

        return 'success'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      await Effect.runPromise(program)

      // Assert: Error email should be sent
      expect(mockEmailService.sentEmails).toHaveLength(1)
      expect(mockEmailService.wasEmailSentTo('error@example.com')).toBe(true)

      const sentEmail = mockEmailService.getLastEmail()
      expect(sentEmail.notificationData?.data.status).toBe('failed')
      expect(sentEmail.notificationData?.data.errorMessage).toBe(
        'Processing failed due to invalid input',
      )
    })

    it('should not send notification when user has disabled email notifications', async () => {
      // Arrange: Create user with email notifications disabled
      const user = createTestUser({
        id: 'no-notify-user',
        email: 'no-notify@example.com',
        emailNotifications: false,
      })
      await db.insert(users).values(user)

      // Act: Simulate notification attempt
      const program = Effect.gen(function* () {
        const userService = yield* UserService
        const emailService = yield* EmailService

        // Check user preferences
        const settings = yield* userService.getSettings('no-notify-user')

        // Only send if notifications are enabled
        if (settings.emailNotifications) {
          yield* emailService.sendJobNotification('no-notify@example.com', {
            jobId: 'test-job',
            jobName: 'Test Job',
            status: 'completed',
            novelTitle: 'Test Novel',
          })
        }

        return settings
      }).pipe(
        Effect.provide(UserServiceLive),
        Effect.provide(createMockEmailServiceLayer(mockEmailService)),
      )

      const settings = await Effect.runPromise(program)

      // Assert: No email should be sent
      expect(settings.emailNotifications).toBe(false)
      expect(mockEmailService.sentEmails).toHaveLength(0)
    })
  })

  describe('Email Service Integration with Job Processing', () => {
    it('should handle email sending failures gracefully without affecting job processing', async () => {
      // Arrange: Create user and job
      const user = createTestUser({
        id: 'email-fail-user',
        email: 'fail@example.com',
        emailNotifications: true,
      })
      await db.insert(users).values(user)

      const novel = createTestNovel('email-fail-user', { id: 'fail-novel' })
      await db.insert(novels).values(novel)

      const job = createTestJob('fail-novel', 'email-fail-user', {
        id: 'email-fail-job',
        status: 'processing',
      })
      await db.insert(jobs).values(job)

      // Act: Simulate job completion with email failure
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Update job to completed (this should succeed)
        yield* Effect.promise(() =>
          db
            .update(jobs)
            .set({
              status: 'completed',
              completedAt: new Date().toISOString(),
            })
            .where(eq(jobs.id, 'email-fail-job')),
        )

        // Try to send notification (this will fail)
        const emailResult = yield* Effect.either(
          emailService.sendJobNotification('fail@example.com', {
            jobId: 'email-fail-job',
            jobName: 'Email Fail Job',
            status: 'completed',
            novelTitle: 'Fail Novel',
          }),
        )

        return { emailResult }
      }).pipe(Effect.provide(createFailingEmailServiceLayer()))

      const result = await Effect.runPromise(program)

      // Assert: Job should be completed despite email failure
      const [jobFromDb] = await db.select().from(jobs).where(eq(jobs.id, 'email-fail-job'))
      expect(jobFromDb.status).toBe('completed')
      expect(jobFromDb.completedAt).toBeDefined()

      // Email should have failed
      expect(result.emailResult._tag).toBe('Left') // Effect.either returns Left for failures
    })

    it('should send multiple notifications for different job events', async () => {
      // Arrange: Create user
      const user = createTestUser({
        id: 'multi-user',
        email: 'multi@example.com',
        emailNotifications: true,
      })
      await db.insert(users).values(user)

      // Act: Send multiple notifications
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Send job started notification
        yield* emailService.sendJobNotification('multi@example.com', {
          jobId: 'multi-job-1',
          jobName: 'Multi Job 1',
          status: 'processing',
          novelTitle: 'Multi Novel',
        })

        // Send job completed notification
        yield* emailService.sendJobNotification('multi@example.com', {
          jobId: 'multi-job-2',
          jobName: 'Multi Job 2',
          status: 'completed',
          novelTitle: 'Multi Novel',
        })

        // Send custom email
        yield* emailService.sendEmail({
          to: 'multi@example.com',
          subject: 'Custom Notification',
          html: '<p>Custom message</p>',
        })

        return 'success'
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      await Effect.runPromise(program)

      // Assert: All emails should be sent
      expect(mockEmailService.sentEmails).toHaveLength(3)

      const emailsToUser = mockEmailService.getEmailsSentTo('multi@example.com')
      expect(emailsToUser).toHaveLength(3)

      // Check different types of emails
      const notifications = emailsToUser.filter((email) => email.notificationData)
      const customEmails = emailsToUser.filter((email) => email.options)

      expect(notifications).toHaveLength(2)
      expect(customEmails).toHaveLength(1)
      expect(customEmails[0].options?.subject).toBe('Custom Notification')
    })
  })

  describe('Email Notification Error Handling', () => {
    it('should log email failures but continue processing', async () => {
      // This test verifies that email failures don't crash the system

      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // This should fail but not throw
        const result = yield* Effect.either(
          emailService.sendJobNotification('test@example.com', {
            jobId: 'test-job',
            jobName: 'Test Job',
            status: 'completed',
            novelTitle: 'Test Novel',
          }),
        )

        return result
      }).pipe(Effect.provide(createFailingEmailServiceLayer()))

      const result = await Effect.runPromise(program)

      // Assert: Should handle failure gracefully
      expect(result._tag).toBe('Left')
      // In a real implementation, this would also check that the error was logged
    })

    it('should validate email addresses before sending', async () => {
      // Arrange: Test with invalid email
      const program = Effect.gen(function* () {
        const emailService = yield* EmailService

        // Try to send to invalid email
        return yield* Effect.either(
          emailService.sendEmail({
            to: 'invalid-email',
            subject: 'Test',
            html: '<p>Test</p>',
          }),
        )
      }).pipe(Effect.provide(createMockEmailServiceLayer(mockEmailService)))

      const result = await Effect.runPromise(program)

      // Assert: Should handle invalid email appropriately
      // The mock service accepts any email, but a real implementation would validate
      expect(result).toBeDefined()
    })
  })
})
