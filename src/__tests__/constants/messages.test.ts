import { describe, expect, it } from 'vitest'
import { COVERAGE_MESSAGES } from '@/constants/messages'

describe('COVERAGE_MESSAGES', () => {
  describe('LOW_COVERAGE_WARNING', () => {
    it('formats chunk-based coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING(1, '78.0')
      expect(message).toBe('チャンク1のカバレッジが低くなっています (78.0%)')
    })
  })

  describe('LOW_COVERAGE_WARNING_EPISODES', () => {
    it('formats single episode coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([1], '78.0')
      expect(message).toBe('エピソード1のカバレッジが低くなっています (78.0%)')
    })

    it('formats multiple episode coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([1, 2, 3], '78.0')
      expect(message).toBe('エピソード1, 2, 3のカバレッジが低くなっています (78.0%)')
    })

    it('handles empty episode array', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([], '78.0')
      expect(message).toBe('エピソード不明のカバレッジが低くなっています (78.0%)')
    })
  })
})
