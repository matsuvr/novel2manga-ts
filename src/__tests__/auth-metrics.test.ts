import { describe, expect, it } from 'vitest'
import { authMetricsEnabled } from '@/utils/auth-metrics'

describe('authMetricsEnabled', () => {
  const makeEnv = (val: string | undefined) => ({ ...process.env, AUTH_METRICS: val })

  it('returns true for "1"', () => {
    expect(authMetricsEnabled(makeEnv('1'))).toBe(true)
  })

  it('accepts common truthy values (case-insensitive)', () => {
    expect(authMetricsEnabled(makeEnv('true'))).toBe(true)
    expect(authMetricsEnabled(makeEnv('TRUE'))).toBe(true)
    expect(authMetricsEnabled(makeEnv('yes'))).toBe(true)
    expect(authMetricsEnabled(makeEnv('on'))).toBe(true)
  })

  it('returns false for falsy/empty/undefined', () => {
    expect(authMetricsEnabled(makeEnv('0'))).toBe(false)
    expect(authMetricsEnabled(makeEnv('false'))).toBe(false)
    expect(authMetricsEnabled(makeEnv('no'))).toBe(false)
    expect(authMetricsEnabled(makeEnv('off'))).toBe(false)
    expect(authMetricsEnabled(makeEnv(''))).toBe(false)
    // @ts-expect-error testing undefined path override
    expect(authMetricsEnabled({ ...process.env, AUTH_METRICS: undefined })).toBe(false)
  })
})
