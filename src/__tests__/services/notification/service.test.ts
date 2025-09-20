/**
 * Notification Service Tests (moved)
 */
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmailConfig, resetEmailConfigCache } from '@/config/email.config'

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn<unknown, Promise<unknown[]>>(),
}

const emailConfigMock = {
  enabled: true,
  debug: false,
  defaults: {
    from: 'Novel2Manga <noreply@novel2manga.com>',
    replyTo: 'support@novel2manga.com',
  },
  smtp: {
    host: 'smtp.test.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@example.com',
      pass: 'password',
    },
  },
}

vi.mock('@/config/email.config', () => ({
  getEmailConfig: () => emailConfigMock,
  resetEmailConfigCache: () => {
    emailConfigMock.enabled = true
    emailConfigMock.debug = false
  },
}))

vi.mock('@/db', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('@/db/schema', () => ({
  jobs: { id: 'jobs.id', userId: 'jobs.userId' },
  users: { id: 'users.id', email: 'users.email', emailNotifications: 'users.emailNotifications' },
}))


vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

let notificationService: typeof import('../../../services/notification/service')['notificationService']

describe('NotificationService', () => {
  let mockSendMail: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    resetEmailConfigCache()

    mockDb.select.mockReturnValue(mockDb)
    mockDb.from.mockReturnValue(mockDb)
    mockDb.where.mockReset()

    mockSendMail = vi.fn()
    const mockTransporter = { sendMail: mockSendMail }
    vi.mocked(nodemailer.createTransport).mockReturnValue(mockTransporter as any)

    // Set up environment variables
    process.env.NEXT_PUBLIC_URL = 'https://novel2manga.com'

    vi.resetModules()
    ;({ notificationService } = await import('../../../services/notification/service'))
    // Sanity check to ensure mocked configuration is active
    expect(getEmailConfig().enabled).toBe(true)
  })

  afterEach(() => {
    // Clean up environment variables
    resetEmailConfigCache()
    delete process.env.NEXT_PUBLIC_URL
  })

  describe('sendJobCompletionNotification', () => {
    it('should send notification when user has notifications enabled', async () => {
      // Mock job data
      mockDb.where.mockResolvedValueOnce([
        {
          id: 'job-123',
          userId: 'user-456',
        },
      ])

      // Mock user data
      mockDb.where.mockResolvedValueOnce([
        {
          id: 'user-456',
          email: 'user@example.com',
          emailNotifications: true,
        },
      ])

      const result = await notificationService.sendJobCompletionNotification('job-123', 'completed')
      expect(result).toBeUndefined()
      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockSendMail).toHaveBeenCalledTimes(1)
    })
  })
})
