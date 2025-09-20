import { describe, expect, it } from 'vitest'
import {
  type ImportanceCandidate,
  normalizeImportanceDistribution,
} from '@/utils/panel-importance'

type CandidateOverride = Partial<ImportanceCandidate>

const candidate = (index: number, override: CandidateOverride = {}): ImportanceCandidate => ({
  index,
  rawImportance: 5,
  dialogueCharCount: 0,
  narrationCharCount: 0,
  contentLength: 0,
  ...override,
})

describe('normalizeImportanceDistribution', () => {
  it('matches configured ratios across a 20-panel sample', () => {
    const candidates = Array.from({ length: 20 }, (_, index) =>
      candidate(index, {
        rawImportance: 10 - Math.floor(index / 2),
        dialogueCharCount: 200 - index,
        contentLength: 400 - index,
      }),
    )

    const normalized = normalizeImportanceDistribution(candidates)
    const counts = new Map<number, number>()

    normalized.forEach(({ importance }) => {
      counts.set(importance, (counts.get(importance) ?? 0) + 1)
    })

    expect(counts.get(1)).toBe(4)
    expect(counts.get(2)).toBe(4)
    expect(counts.get(3)).toBe(6)
    expect(counts.get(4)).toBe(4)
    expect(counts.get(5)).toBe(1)
    expect(counts.get(6)).toBe(1)
  })

  it('keeps panels with richer dialogue at higher levels when ties occur', () => {
    const candidates = [
      candidate(0, { rawImportance: 9, dialogueCharCount: 12, contentLength: 120 }),
      candidate(1, { rawImportance: 9, dialogueCharCount: 40, contentLength: 140 }),
      candidate(2, { rawImportance: 8, dialogueCharCount: 8, contentLength: 100 }),
      candidate(3, { rawImportance: 7, dialogueCharCount: 4, contentLength: 80 }),
    ]

    const normalized = normalizeImportanceDistribution(candidates)
    const byIndex = new Map(normalized.map((entry) => [entry.index, entry.importance]))

  expect(byIndex.get(1)).toBeGreaterThan(byIndex.get(0) ?? 0)
  })

  it('demotes earlier panels when every other signal is equal', () => {
    const candidates = [
      candidate(0, { rawImportance: 8, dialogueCharCount: 20, contentLength: 120 }),
      candidate(1, { rawImportance: 8, dialogueCharCount: 20, contentLength: 120 }),
      candidate(2, { rawImportance: 7, dialogueCharCount: 19, contentLength: 110 }),
    ]

    const normalized = normalizeImportanceDistribution(candidates)
    const byIndex = new Map(normalized.map((entry) => [entry.index, entry.importance]))

    expect(byIndex.get(1)).toBeGreaterThan(byIndex.get(0) ?? 0)
    expect(byIndex.get(0)).toBeGreaterThan(byIndex.get(2) ?? 0)
  })
})
