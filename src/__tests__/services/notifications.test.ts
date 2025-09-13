/**
 * NotificationService Tests
 *
 * Tests for the NotificationService implementation with proper
 * email transport dependency mocking.
 */

import { EmailTransportMockUtils } from '@test/mocks/service.mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobNotificationPayload } from '@/services/notifications'

// Mock email transport dependencies
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}))

describe('NotificationService', () => {
  let consoleSpy: any
  let mockTransport: any

  beforeEach(async () => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    delete process.env.NOTIFICATIONS_ENABLED

    // Reset singleton for each test by dynamically importing via ESM so Vite aliasing applies
    const notificationsModule = await import('@/services/notifications')
    // @ts-expect-error - tests manipulate private singleton for isolation
    ;(notificationsModule as any).singleton = null
  })

  describe('when notifications are disabled', () => {
    it('should log disabled message and not send email', async () => {
      // Arrange
      process.env.NOTIFICATIONS_ENABLED = 'false'
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'test-job-1',
        status: 'completed',
        completedAt: new Date().toISOString(),
      }

      // Act
      await service.sendJobCompletionEmail('user@example.com', payload)

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (disabled) sendJobCompletionEmail',
        expect.objectContaining({
          email: 'user@example.com',
          payload,
        }),
      )
    })

    it('should handle undefined NOTIFICATIONS_ENABLED as disabled', async () => {
      // Arrange
      delete process.env.NOTIFICATIONS_ENABLED
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'test-job-2',
        status: 'failed',
        errorMessage: 'Processing failed',
      }

      // Act
      await service.sendJobCompletionEmail('user@example.com', payload)

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (disabled) sendJobCompletionEmail',
        expect.objectContaining({
          email: 'user@example.com',
          payload,
        }),
      )
    })
  })

  describe('when notifications are enabled', () => {
    beforeEach(() => {
      process.env.NOTIFICATIONS_ENABLED = 'true'
    })

    it('should log stub send message when enabled', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'test-job-3',
        status: 'completed',
      }

      // Act
      await service.sendJobCompletionEmail('user@example.com', payload)

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (stub) would send email',
        expect.objectContaining({
          email: 'user@example.com',
          payload,
        }),
      )
    })

    it('should handle job completion notification', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'job-completed-123',
        status: 'completed',
        completedAt: '2024-01-01T12:00:00Z',
      }

      // Act
      await service.sendJobCompletionEmail('success@example.com', payload)

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (stub) would send email',
        expect.objectContaining({
          email: 'success@example.com',
          payload: expect.objectContaining({
            jobId: 'job-completed-123',
            status: 'completed',
            completedAt: '2024-01-01T12:00:00Z',
          }),
        }),
      )
    })

    it('should handle job failure notification', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'job-failed-456',
        status: 'failed',
        errorMessage: 'Network timeout during processing',
      }

      // Act
      await service.sendJobCompletionEmail('failure@example.com', payload)

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (stub) would send email',
        expect.objectContaining({
          email: 'failure@example.com',
          payload: expect.objectContaining({
            jobId: 'job-failed-456',
            status: 'failed',
            errorMessage: 'Network timeout during processing',
          }),
        }),
      )
    })
  })

  describe('service interface compliance', () => {
    it('should implement NotificationService interface', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()

      // Assert
      expect(service).toHaveProperty('sendJobCompletionEmail')
      expect(typeof service.sendJobCompletionEmail).toBe('function')
    })

    it('should return the same singleton instance', async () => {
      // Arrange & Act
      const { getNotificationService } = await import('@/services/notifications')
      const service1 = getNotificationService()
      const service2 = getNotificationService()

      // Assert
      expect(service1).toBe(service2)
    })

    it('should handle email parameter validation', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'test-validation',
        status: 'completed',
      }

      // Act & Assert - should not throw for valid email
      await expect(
        service.sendJobCompletionEmail('valid@example.com', payload),
      ).resolves.toBeUndefined()
    })

    it('should handle payload parameter validation', async () => {
      // Arrange
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()

      // Act & Assert - should not throw for valid payload
      await expect(
        service.sendJobCompletionEmail('user@example.com', {
          jobId: 'test-payload',
          status: 'completed',
        }),
      ).resolves.toBeUndefined()

      await expect(
        service.sendJobCompletionEmail('user@example.com', {
          jobId: 'test-payload-2',
          status: 'failed',
          errorMessage: 'Test error',
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('future email transport integration', () => {
    it('should be ready for real email transport implementation', async () => {
      // This test documents the expected behavior when real email transport is implemented
      // Currently using console logging as a stub

      // Arrange
      process.env.NOTIFICATIONS_ENABLED = 'true'
      const { getNotificationService } = await import('@/services/notifications')
      const service = getNotificationService()
      const payload: JobNotificationPayload = {
        jobId: 'future-transport-test',
        status: 'completed',
      }

      // Act
      await service.sendJobCompletionEmail('transport@example.com', payload)

      // Assert - Currently logs, but should send real email in future
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Notification] (stub) would send email',
        expect.any(Object),
      )

      // TODO: When real transport is implemented, this should verify:
      // - Email template rendering
      // - SMTP/SES/SendGrid integration
      // - Retry logic for failed sends
      // - Email delivery confirmation
    })
  })
})
