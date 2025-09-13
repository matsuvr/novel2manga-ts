/**
 * Integration test email helper
 */

import { Effect, Layer } from 'effect'
import { EmailError, EmailOptions, EmailService, JobNotificationData } from '@/services/email'

/**
 * Mock email service for testing
 */
export class MockEmailService {
  public sentEmails: Array<{
    options?: EmailOptions
    notificationData?: { email: string; data: JobNotificationData }
    timestamp: Date
  }> = []

  sendEmail = (options: EmailOptions) => {
    this.sentEmails.push({ options, timestamp: new Date() })
    return Effect.succeed(undefined)
  }

  sendJobNotification = (email: string, data: JobNotificationData) => {
    this.sentEmails.push({ notificationData: { email, data }, timestamp: new Date() })
    return Effect.succeed(undefined)
  }

  /**
   * Reset sent emails list
   */
  reset() {
    this.sentEmails = []
  }

  /**
   * Get last sent email
   */
  getLastEmail() {
    return this.sentEmails[this.sentEmails.length - 1]
  }

  /**
   * Get all sent emails
   */
  getAllEmails() {
    return [...this.sentEmails]
  }

  /**
   * Check if email was sent to specific address
   */
  wasEmailSentTo(email: string): boolean {
    return this.sentEmails.some(
      (sent) => sent.options?.to === email || sent.notificationData?.email === email,
    )
  }

  /**
   * Get emails sent to specific address
   */
  getEmailsSentTo(email: string) {
    return this.sentEmails.filter(
      (sent) => sent.options?.to === email || sent.notificationData?.email === email,
    )
  }
}

/**
 * Create mock email service layer for testing
 */
export function createMockEmailServiceLayer(mockService?: MockEmailService) {
  const service = mockService || new MockEmailService()

  return Layer.succeed(EmailService, service)
}

/**
 * Create failing email service for error testing
 */
export function createFailingEmailServiceLayer() {
  return Layer.succeed(EmailService, {
    sendEmail: () => Effect.fail(new EmailError('Mock email failure')),
    sendJobNotification: () => Effect.fail(new EmailError('Mock notification failure')),
  })
}
