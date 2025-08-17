import { describe, expect, it } from 'vitest'
import { extractErrorMessage } from '@/utils/api-error'

describe('extractErrorMessage', () => {
  it('handles Error instance', () => {
    const err = new Error('boom')
    expect(extractErrorMessage(err)).toBe('boom')
  })
  it('handles string', () => {
    expect(extractErrorMessage('plain')).toBe('plain')
  })
  it('serializes object', () => {
    expect(extractErrorMessage({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}')
  })
  it('falls back to String for circular object', () => {
    const obj: Record<string, unknown> = {}
    // 循環参照を生成（Record<string, unknown> なので self プロパティ追加は許容される）
    obj.self = obj
    const result = extractErrorMessage(obj)
    // Circular -> JSON.stringify throws -> fallback to String => [object Object]
    expect(result).toBe('[object Object]')
  })

  it('handles undefined', () => {
    expect(extractErrorMessage(undefined)).toBe('undefined')
  })

  it('handles null', () => {
    expect(extractErrorMessage(null)).toBe('null')
  })

  it('handles symbol', () => {
    const sym = Symbol('test')
    expect(extractErrorMessage(sym)).toBe('Symbol(test)')
  })

  it('handles function', () => {
    function sampleFn() {
      /* noop */
    }
    const msg = extractErrorMessage(sampleFn)
    expect(msg).toMatch(/sampleFn|function/i)
  })

  it('truncates very large JSON strings (>1000 chars)', () => {
    const large = { data: 'a'.repeat(1500) }
    const msg = extractErrorMessage(large)
    expect(msg.length).toBe(1000)
    expect(msg.endsWith('...')).toBe(true)
  })
})
