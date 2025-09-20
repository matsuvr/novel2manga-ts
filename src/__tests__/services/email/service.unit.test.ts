/**
 * Email Service Unit Tests (moved)
 */

import { Effect } from 'effect'
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEmailConfigCache } from '@/config/email.config'
import { routesConfig } from '@/config/routes.config'
import { EmailService, EmailServiceLive } from '../../../services/email/service'

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

describe('Email Service Unit Tests', () => {
  const mockSendMail = vi.fn()
  const mockTransporter = {
    sendMail: mockSendMail,
    verify: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    resetEmailConfigCache()
    vi.mocked(nodemailer.createTransport).mockReturnValue(mockTransporter as any)

    // Set up environment variables
    vi.stubEnv('EMAIL_ENABLED', 'true')
    vi.stubEnv('EMAIL_DEBUG', 'false')
    vi.stubEnv('SMTP_HOST', 'smtp.test.com')
    vi.stubEnv('SMTP_PORT', '587')
    vi.stubEnv('SMTP_SECURE', 'false')
    vi.stubEnv('SMTP_USER', 'test@example.com')
    vi.stubEnv('SMTP_PASS', 'password')
    vi.stubEnv('MAIL_FROM', 'Novel2Manga <noreply@novel2manga.com>')
    vi.stubEnv('MAIL_REPLY_TO', 'support@novel2manga.com')
    vi.stubEnv('NEXT_PUBLIC_URL', 'https://novel2manga.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetEmailConfigCache()
  })

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-id-123' })

      const program = Effect.gen(function* () {
        const emailService = yield* EmailService
        yield* emailService.sendEmail({
          to: 'user@example.com',
          subject: 'Test Subject',
          html: '<p>Test HTML content</p>',
          text: 'Test text content',
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(EmailServiceLive)))

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'Novel2Manga <noreply@novel2manga.com>',
        replyTo: 'support@novel2manga.com',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        text: 'Test text content',
      })
    })
  })

  describe('sendJobNotification', () => {
    it('should include job URL when job completes', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'job-success-1' })

      const program = Effect.gen(function* () {
        const emailService = yield* EmailService
        yield* emailService.sendJobNotification('user@example.com', {
          jobId: 'job-1',
          jobName: 'Job 1',
          status: 'completed',
          novelTitle: 'Novel 1',
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(EmailServiceLive)))

      const html = mockSendMail.mock.calls[0][0].html as string
      expect(html).toContain('/portal/jobs/job-1')
    })

    it('should link to dashboard when job fails', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'job-fail-1' })

      const program = Effect.gen(function* () {
        const emailService = yield* EmailService
        yield* emailService.sendJobNotification('user@example.com', {
          jobId: 'job-2',
          jobName: 'Job 2',
          status: 'failed',
          novelTitle: 'Novel 2',
          errorMessage: 'boom',
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(EmailServiceLive)))

      const html = mockSendMail.mock.calls[0][0].html as string
      expect(html).toContain(routesConfig.portal.dashboard)
    })
  })
})
