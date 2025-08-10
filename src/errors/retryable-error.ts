export class RetryableError extends Error {
  public readonly retryable = true

  constructor(
    message: string,
    public retryAfter?: number,
  ) {
    super(message)
    this.name = 'RetryableError'
  }
}

// Type guard for RetryableError
export function isRetryableError(error: unknown): error is RetryableError {
  return (
    error instanceof RetryableError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { retryable?: unknown }).retryable === true)
  )
}
