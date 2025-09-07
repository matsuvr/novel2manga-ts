import { Data } from 'effect'

export class RenderError extends Data.TaggedError('RenderError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class FontError extends Data.TaggedError('FontError')<{
  readonly message: string
  readonly fontPath: string
  readonly cause?: unknown
}> {}

export class PlaywrightError extends Data.TaggedError('PlaywrightError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
  readonly errors: ReadonlyArray<unknown>
}> {}

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly message: string
}> {}

export type AppError =
  | RenderError
  | FontError
  | PlaywrightError
  | ValidationError
  | AuthenticationError
