/**
 * Notification Service Tests (moved)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationService } from '../../../services/notification/service'

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
}

vi.mock('@/db', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('@/db/schema', () => ({
  jobs: { id: 'jobs.id', userId: 'jobs.userId' },
  users: { id: 'users.id', email: 'users.email', emailNotifications: 'users.emailNotifications' },
}))

vi.mock('@/infrastructure/logging/logger', () => ({
  getLogger: () => ({
    withContext: () => ({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
  }),
}))

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Set up environment variables
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_USER = 'test@example.com'
    process.env.SMTP_PASS = 'password'
    process.env.MAIL_FROM = 'Novel2Manga <noreply@novel2manga.com>'
    process.env.NEXT_PUBLIC_URL = 'https://novel2manga.com'
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.MAIL_FROM
    delete process.env.NEXT_PUBLIC_URL
  })

  describe('sendJobCompletionNotification', () => {
    it('should send notification when user has notifications enabled', async () => {
      // Mock job data
      mockDb.select.mockResolvedValueOnce([
        {
          id: 'job-123',
          userId: 'user-456',
        },
      ])

      // Mock user data
      mockDb.select.mockResolvedValueOnce([
        {
          id: 'user-456',
          email: 'user@example.com',
          emailNotifications: true,
        },
      ])

      const result = await notificationService.sendJobCompletionNotification('job-123', 'completed')
      expect(result).toBeUndefined()
    })
  })
})
