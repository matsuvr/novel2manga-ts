// Standard HTTP error classes for API routes. Use these to signal expected error statuses.

export class HttpError extends Error {
  public readonly status: number
  public readonly code?: string
  public readonly details?: unknown

  constructor(
    message: string,
    status = 500,
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = options?.code
    this.details = options?.details
    if (options?.cause) {
      // Preserve error cause when supported by runtime
      this.cause = options.cause
    }
  }
}

export class BadRequestError extends HttpError {
  constructor(
    message = 'Bad Request',
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, 400, options)
  }
}

export class NotFoundError extends HttpError {
  constructor(
    message = 'Not Found',
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, 404, options)
  }
}

export class UnauthorizedError extends HttpError {
  constructor(
    message = 'Unauthorized',
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, 401, options)
  }
}

export class ForbiddenError extends HttpError {
  constructor(
    message = 'Forbidden',
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, 403, options)
  }
}

export class ConflictError extends HttpError {
  constructor(
    message = 'Conflict',
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message, 409, options)
  }
}
