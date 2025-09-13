/**
 * Email Service Unit Tests (moved)
 */

import { Effect } from 'effect'
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    vi.mocked(nodemailer.createTransport).mockReturnValue(mockTransporter as any)

    // Set up environment variables
    vi.stubEnv('SMTP_HOST', 'smtp.test.com')
    vi.stubEnv('SMTP_PORT', '587')
    vi.stubEnv('SMTP_USER', 'test@example.com')
    vi.stubEnv('SMTP_PASS', 'password')
    vi.stubEnv('MAIL_FROM', 'Novel2Manga <noreply@novel2manga.com>')
    vi.stubEnv('NEXT_PUBLIC_URL', 'https://novel2manga.com')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML content</p>',
        text: 'Test text content',
      })
    })
  })
})
