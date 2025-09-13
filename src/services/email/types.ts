/**
 * Email service types and interfaces
 */

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export interface JobNotificationData {
  jobId: string
  status: 'completed' | 'failed'
  errorMessage?: string
}

export class EmailError {
  readonly _tag = 'EmailError'
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

export class EmailConfigurationError {
  readonly _tag = 'EmailConfigurationError'
  constructor(readonly message: string) {}
}
