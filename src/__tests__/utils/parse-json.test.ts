import { describe, expect, it } from 'vitest'
import { parseJson } from '@/utils/json'

describe('parseJson', () => {
  it('removes trailing null characters before parsing', () => {
    const result = parseJson<{ foo: string }>('{"foo":"bar"}\u0000\u0000')
    expect(result).toEqual({ foo: 'bar' })
  })

  it('throws on extra non-null characters', () => {
    expect(() => parseJson('{"foo":"bar"}abc')).toThrow()
  })
})
