import { describe, expect, it } from 'vitest'
import { EpisodeBreakEstimationStep } from '@/services/application/steps/episode-break-estimation-step'
import type { EpisodeBreakPlan } from '@/types/script'
import { TEST_EPISODE_CONFIG } from './integration/__helpers/test-agents'

// Privateメソッドに型安全にアクセスするためのテスト用インターフェース
interface EpisodeBreakEstimationStepPrivate {
  normalizeEpisodeBreaks: (plan: EpisodeBreakPlan, totalPanels: number) => EpisodeBreakPlan
  validateEpisodeBreaks: (
    plan: EpisodeBreakPlan,
    totalPanels: number,
    cfg: typeof TEST_EPISODE_CONFIG,
  ) => { valid: boolean; issues: string[] }
}

describe('EpisodeBreakEstimationStep.normalizeEpisodeBreaks', () => {
  it('重複した開始インデックスを与えられた場合、余剰エピソードを除去し連続カバレッジに正規化する', () => {
    const step = new EpisodeBreakEstimationStep()
    const priv = step as unknown as EpisodeBreakEstimationStepPrivate

    const totalPanels = 73
    // LLMが誤って同じ開始位置(24)を2回出したケースを再現
    const input: EpisodeBreakPlan = {
      episodes: [
        { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 10, title: 'ep1' },
        { episodeNumber: 2, startPanelIndex: 24, endPanelIndex: 30, title: 'ep2' },
        { episodeNumber: 3, startPanelIndex: 24, endPanelIndex: 40, title: 'ep3' },
      ],
    }

    const normalized = priv.normalizeEpisodeBreaks(input, totalPanels)

    // 正規化後はユニークな開始位置だけを使い、エピソード数は2本になる
    expect(normalized.episodes.length).toBe(2)
    expect(normalized.episodes[0].startPanelIndex).toBe(1)
    expect(normalized.episodes[0].endPanelIndex).toBe(23) // 次の開始-1
    expect(normalized.episodes[1].startPanelIndex).toBe(24)
    expect(normalized.episodes[1].endPanelIndex).toBe(73) // 合計パネルで終わる

    const validation = priv.validateEpisodeBreaks(normalized, totalPanels, TEST_EPISODE_CONFIG)
    expect(validation.valid).toBe(true)
    expect(validation.issues).toEqual([])
  })
})
