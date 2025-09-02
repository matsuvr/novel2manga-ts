import { describe, expect, it } from 'vitest'
import { shouldRunMigrations } from '@/db'

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
}

describe('shouldRunMigrations', () => {
  it('returns false when DB_SKIP_MIGRATE=1', () => {
    expect(shouldRunMigrations({ ...baseEnv, DB_SKIP_MIGRATE: '1' })).toBe(false)
  })

  it('returns true in development by default', () => {
    expect(shouldRunMigrations({ ...baseEnv })).toBe(true)
  })

  it('returns true in test', () => {
    expect(shouldRunMigrations({ ...baseEnv, NODE_ENV: 'test' })).toBe(true)
  })

  it('returns true when VITEST is set', () => {
    expect(shouldRunMigrations({ ...baseEnv, VITEST: '1' })).toBe(true)
  })

  it('returns false in production', () => {
    expect(shouldRunMigrations({ ...baseEnv, NODE_ENV: 'production' })).toBe(false)
  })
})
