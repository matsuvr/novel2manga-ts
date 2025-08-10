import { RetryableError } from './retryable-error'

export class RateLimitError extends RetryableError {
  constructor(message: string, retryAfter?: number) {
    super(message, retryAfter)
    this.name = 'RateLimitError'
  }
}
