import { describe, expect, it } from 'vitest'
import { COVERAGE_MESSAGES } from '@/constants/messages'

describe('COVERAGE_MESSAGES', () => {
  describe('LOW_COVERAGE_WARNING', () => {
    it('formats chunk-based coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING(1, '78.0')
      expect(message).toBe(
        'エピソード不明において原文の内容が十分に反映されていない可能性があります（78.0%）',
      )
    })
  })

  describe('LOW_COVERAGE_WARNING_EPISODES', () => {
    it('formats single episode coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([1], '78.0')
      expect(message).toBe(
        'エピソード1において原文の内容が十分に反映されていない可能性があります（78.0%）',
      )
    })

    it('formats multiple episode coverage warning correctly', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([1, 2, 3], '78.0')
      expect(message).toBe(
        'エピソード1～3において原文の内容が十分に反映されていない可能性があります（78.0%）',
      )
    })

    it('handles empty episode array', () => {
      const message = COVERAGE_MESSAGES.LOW_COVERAGE_WARNING_EPISODES([], '78.0')
      expect(message).toBe(
        'エピソード不明において原文の内容が十分に反映されていない可能性があります（78.0%）',
      )
    })
  })
})
