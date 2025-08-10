import { RetryableError } from './retryable-error'

export class RateLimitError extends RetryableError {
  constructor(message: string, retryAfter?: number) {
    super(message, retryAfter)
    this.name = 'RateLimitError'
  }
}

// Type guard for RateLimitError
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError
}
