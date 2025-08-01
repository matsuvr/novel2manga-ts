import { describe, expect, it } from 'vitest'

describe('Sample Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle string comparisons', () => {
    const greeting = 'Hello, Vitest!'
    expect(greeting).toContain('Vitest')
  })
})
