import { Data, Effect } from 'effect'

/**
 * Episode generation / extraction domain error taxonomy (F1 phase)
 * All downstream steps should converge on this union so that retry / fallback policies
 * can be centrally reasoned about.
 */
export type EpisodeError =
  | ValidationError
  | InvariantViolation
  | ExternalIOError
  | DatabaseError
  | ParseError
  | ScriptNotFoundError

/** Invalid external input / user provided break plan etc. Non‑retryable */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  message: string
  details?: unknown
}> {}

/** Internal invariant broken (empty text after build etc). Investigate; non‑retryable */
export class InvariantViolation extends Data.TaggedError('InvariantViolation')<{
  message: string
  details?: unknown
}> {}

/** Storage (S3/local) or filesystem like transient IO problems. Retryable */
export class ExternalIOError extends Data.TaggedError('ExternalIOError')<{
  message: string
  cause?: unknown
  transient?: boolean
}> {}

/** Database operation failed. Potentially transient; mark with transient flag */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  message: string
  cause?: unknown
  transient?: boolean
}> {}

/** Parsing / schema mismatch for script, non‑retryable until data fixed */
export class ParseError extends Data.TaggedError('ParseError')<{
  message: string
  details?: unknown
}> {}

/** Referenced script / episode data not found */
export class ScriptNotFoundError extends Data.TaggedError('ScriptNotFoundError')<{
  message: string
}> {}

export const EpisodeError = {
  isRetryable: (e: EpisodeError): boolean => {
    switch (e._tag) {
      case 'ExternalIOError':
      case 'DatabaseError':
        return e.transient !== false // default retryable unless explicitly false
      default:
        return false
    }
  },
  toMessage: (e: EpisodeError): string => e.message,
}

/** Helper to wrap promise into Effect with DatabaseError */
export function fromPromiseDb<T>(thunk: () => Promise<T>, label: string): Effect.Effect<T, DatabaseError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => new DatabaseError({ message: `${label} failed`, cause })
  })
}

/** Helper to wrap promise into Effect with ExternalIOError */
export function fromPromiseIO<T>(thunk: () => Promise<T>, label: string): Effect.Effect<T, ExternalIOError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => new ExternalIOError({ message: `${label} failed`, cause })
  })
}
