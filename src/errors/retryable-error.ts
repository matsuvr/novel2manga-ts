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
