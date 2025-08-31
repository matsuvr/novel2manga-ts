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

  it('parses fenced JSON with language + spaces and CRLF', () => {
    const s = '```  json  \r\n{\r\n  "ok": true\r\n}\r\n```'
    expect(extractFirstJsonChunk(s)).toBe('{\n  "ok": true\n}')
  })

  it('ignores text before fence and extracts inner json', () => {
    const s = 'note before\n```json\n{"k":1}\n``` after'
    expect(extractFirstJsonChunk(s)).toBe('{"k":1}')
  })

  it('extracts when closing fence is missing', () => {
    const s =
      '```json\n{"a": [1, 2, 3], "b": {"c": true}}\ntrailing explanation text that should be ignored'
    expect(extractFirstJsonChunk(s)).toBe('{"a": [1, 2, 3], "b": {"c": true}}')
  })

  it('sanitizes trailing commas and comments', () => {
    const s =
      '```json\n{\n  "a": [1,2,3,], // trailing comma\n  /* block comment */\n  "b": {"c": true,}\n}\n```'
    // extractFirstJsonChunk は、抽出後の文字列を返す（サニタイズ適用後）
    const extracted = extractFirstJsonChunk(s)
    expect(() => JSON.parse(extracted)).not.toThrow()
    const obj = JSON.parse(extracted) as { a: number[]; b: { c: boolean } }
    expect(obj.a).toEqual([1, 2, 3])
    expect(obj.b.c).toBe(true)
  })

  it('extracts first balanced object', () => {
    const s = 'Note: see below {"k":"v","arr":[1,2,{"z":0}]} trailing.'
    expect(extractFirstJsonChunk(s)).toBe('{"k":"v","arr":[1,2,{"z":0}]}')
  })

  it('throws on no json', () => {
    expect(() => extractFirstJsonChunk('no json here')).toThrow()
  })
})
