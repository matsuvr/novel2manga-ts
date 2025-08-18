import { describe, expect, it } from 'vitest'
import { extractFirstJsonChunk } from '../agents/llm/utils'

describe('extractFirstJsonChunk', () => {
  it('parses plain JSON object', () => {
    const s = '{"a":1,"b":[2,3]}'
    expect(extractFirstJsonChunk(s)).toBe(s)
  })

  it('parses fenced JSON', () => {
    const s = '```json\n{"x":true}\n```'
    expect(extractFirstJsonChunk(s)).toBe('{"x":true}')
  })

  it('extracts first balanced object', () => {
    const s = 'Note: see below {"k":"v","arr":[1,2,{"z":0}]} trailing.'
    expect(extractFirstJsonChunk(s)).toBe('{"k":"v","arr":[1,2,{"z":0}]}')
  })

  it('throws on no json', () => {
    expect(() => extractFirstJsonChunk('no json here')).toThrow()
  })
})
