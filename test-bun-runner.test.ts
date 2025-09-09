import { describe, test, expect, vi } from 'vitest'

// Test suite for Bun test runner evaluation (run under Vitest in CI)
describe('Bun Test Runner Evaluation', () => {
  test('basic assertion works', () => {
    expect(1 + 1).toBe(2)
  })

  test('string matching works', () => {
    expect('hello world').toContain('world')
    expect('TypeScript').toMatch(/script/i)
  })

  test('array operations work', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(arr).toHaveLength(5)
    expect(arr).toContain(3)
    expect(arr.filter(x => x > 3)).toEqual([4, 5])
  })

  test('object comparison works', () => {
    const user = { name: 'Alice', age: 30 }
    expect(user).toEqual({ name: 'Alice', age: 30 })
    expect(user).toHaveProperty('name', 'Alice')
  })

  test('async test works', async () => {
    const result = await Promise.resolve('async result')
    expect(result).toBe('async result')
  })

  test('error handling works', () => {
    expect(() => {
      throw new Error('Test error')
    }).toThrow('Test error')
  })

  test('mocking works', () => {
    const mockFn = vi.fn(() => 'mocked')
    expect(mockFn()).toBe('mocked')
  })

  describe('nested test suite', () => {
    test('nested test 1', () => {
      expect(Math.sqrt(16)).toBe(4)
    })

    test('nested test 2', () => {
      expect([1, 2, 3].reduce((a, b) => a + b, 0)).toBe(6)
    })
  })
})

// Performance test
describe('Performance Tests', () => {
  test('array operations performance', () => {
    const start = performance.now()
    const arr = Array.from({ length: 10000 }, (_, i) => i * 2)
    const result = arr.filter(x => x % 3 === 0).map(x => x * 2)
    const end = performance.now()

    expect(result.length).toBeGreaterThan(0)
    expect(end - start).toBeLessThan(100) // Should complete in less than 100ms
  })
})
