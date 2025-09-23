// Centralized retry configuration for transient errors (F7 phase)
// NOTE: We removed the unused buildStandardRetrySchedule helper after moving
// to a manual exponential retry loop (see utils/retry.ts). Keep only plain
// policy values here to avoid API drift / confusion.

// (Deliberately no Effect imports; schedule construction is handled where used.)

export interface RetryPolicyConfig {
  readonly maxAttempts: number
  readonly baseDelayMillis: number
  readonly maxDelayMillis: number
  readonly jitter: boolean
}

export const retryPolicyConfig: RetryPolicyConfig = {
  maxAttempts: 3, // initial conservative; can be tuned per domain
  baseDelayMillis: 300, // 0.3s exponential backoff start
  maxDelayMillis: 5_000, // cap individual delay to 5s
  jitter: true,
} as const
export const RetryConfig = { retryPolicyConfig }
