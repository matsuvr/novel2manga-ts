import { describe, expect, it } from 'vitest'
import { getMissingAuthEnv } from '@/utils/auth-env'

describe('getMissingAuthEnv', () => {
  it('returns empty when all vars exist', () => {
    const env = {
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
      AUTH_SECRET: 'abc',
    } as NodeJS.ProcessEnv
    expect(getMissingAuthEnv(env)).toEqual([])
  })

  it('detects missing variables', () => {
    const env = {
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: undefined,
      AUTH_SECRET: 'x',
    } as unknown as NodeJS.ProcessEnv
    expect(getMissingAuthEnv(env)).toEqual(['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'])
  })
})
