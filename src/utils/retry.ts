import { Duration, Effect } from 'effect'
import { retryPolicyConfig } from '@/config/retry.config'
import type { EpisodeError } from '@/types/errors/episode-error'
import { EpisodeError as EE } from '@/types/errors/episode-error'

export interface RetryOptions {
  readonly label: string
  readonly logger?: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void }
  // NOTE: onFail フックは未使用のため削除（必要になったらコールバックとして再導入検討）
}

/**
 * Wrap an Effect producing EpisodeError with standardized retry policy.
 * Only retry when EpisodeError.isRetryable(e) === true.
 */
export const withEpisodeRetry = <A>(
  eff: Effect.Effect<A, EpisodeError>,
  options: RetryOptions,
): Effect.Effect<A, EpisodeError> => {
  const { label, logger } = options
  const { maxAttempts, baseDelayMillis, maxDelayMillis, jitter } = retryPolicyConfig

  const loop = (attempt: number, currentDelay: number): Effect.Effect<A, EpisodeError> =>
    eff.pipe(
      Effect.catchAll((err) => {
        const retryable = EE.isRetryable(err)
        const isLast = attempt >= maxAttempts - 1 || !retryable
        if (isLast) {
          logger?.warn(`${label}: giving up`, {
            attempt,
            kind: err._tag,
            message: err.message,
            retryable,
          })
          return Effect.fail(err)
        }
        const nextBase = Math.min(currentDelay * 2, maxDelayMillis)
        const actualDelay = jitter ? Math.floor(Math.random() * nextBase) : nextBase
        logger?.warn(`${label}: transient error – retrying`, {
          attempt,
            nextDelay: actualDelay,
          kind: err._tag,
          message: err.message,
        })
        return Effect.sleep(Duration.millis(actualDelay)).pipe(
          Effect.flatMap(() => loop(attempt + 1, nextBase)),
        )
      }),
    )
  return loop(0, baseDelayMillis)
}
