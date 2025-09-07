import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseJson, parseJsonWithSchema } from '@/utils/json'

describe('parseJson', () => {
  it('removes trailing null characters before parsing', () => {
    const result = parseJson('{"foo":"bar"}\u0000\u0000')
    expect(result).toEqual({ foo: 'bar' })
  })

  it('throws on extra non-null characters', () => {
    expect(() => parseJson('{"foo":"bar"}abc')).toThrow()
  })

  it('handles valid JSON without trailing nulls', () => {
    const result = parseJson('{"foo":"bar"}')
    expect(result).toEqual({ foo: 'bar' })
  })

  it('throws on empty string', () => {
    expect(() => parseJson('')).toThrow()
  })

  it('throws on string with only null characters', () => {
    expect(() => parseJson('\u0000\u0000')).toThrow()
  })
})

describe('parseJsonWithSchema', () => {
  const schema = z.object({ foo: z.string() })

  it('parses and validates with schema', () => {
    const result = parseJsonWithSchema('{"foo":"bar"}\u0000', schema)
    expect(result).toEqual({ foo: 'bar' })
  })

  it('throws when schema validation fails', () => {
    expect(() => parseJsonWithSchema('{"foo":1}', schema)).toThrow()
  })
})
