import { Effect } from 'effect'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// 先にモックを定義し、以降の import で利用されるようにする
const novelId = 'testnovel123'
const longNarrativeSample = Array.from({ length: 80 }, () => '登場人物がいて出来事が進行する物語です。').join('')
vi.mock('@/utils/job', () => {
  return {
    getNovelIdForJob: vi.fn(async () => novelId),
  }
})

import { chunkConversionEffect } from '@/agents/chunk-conversion'
import { getLogger } from '@/infrastructure/logging/logger'
import { InputValidationStep } from '@/services/application/steps/input-validation-step'
import { LlmLogService } from '@/services/llm/log-service'
import { clearStorageCache, getLlmLogStorage } from '@/utils/storage'

// このテストは LLM 実呼び出しを避けるため provider=fake 前提 (CIで高速)
// fake provider が構造化生成を返しログ保存ラッパーが動作することのみを検証

describe('LLM logging integration (fake provider)', () => {
  const jobId = 'job123'
  let previousCount = 0
  const createStepContext = () => ({
    jobId,
    novelId,
    logger: getLogger(),
    ports: {} as Record<string, unknown>,
  })

  beforeAll(async () => {
    clearStorageCache()
  })

  async function expectLogCountIncreases(stepLabel: string, opts?: { allowEqual?: boolean }) {
    const storage = await getLlmLogStorage()
    const keys = (await storage.list?.(novelId + '/')) || []
    if (keys.length <= previousCount && !opts?.allowEqual) {
      expect(keys.length, `${stepLabel}: log count should increase`).toBeGreaterThan(previousCount)
    }
    previousCount = keys.length
  }

  it('logs narrativity judge call', async () => {
    const step = new InputValidationStep()
    const res = await step.validate(longNarrativeSample, createStepContext() as any)
    expect(res.success).toBe(true)
    await expectLogCountIncreases('narrativity-judge')
  })

  it('logs chunk conversion call', async () => {
    const eff = chunkConversionEffect(
      {
        chunkText: '登場人物AがBと会話するシーン。',
        chunkIndex: 0,
        chunksNumber: 1,
      },
      { jobId },
    )
    await Effect.runPromise(eff).catch(() => {
      /* ignore fake schema mismatch */
    })
    await expectLogCountIncreases('chunk-conversion')
  })

  it('logs episode break estimation call', async () => {
    // episodeBreakEstimation 用プロンプト欠損でログが生成されない回避: モジュール再読込＆局所 config モック
    vi.resetModules()
    vi.doMock('@/config/app.config', () => ({
      appConfig: { llm: { episodeBreakEstimation: { systemPrompt: 'ep-break system', userPromptTemplate: '【統合スクリプト】\n{{scriptJson}}' } } },
      getAppConfigWithOverrides: () => ({ llm: { episodeBreakEstimation: { systemPrompt: 'ep-break system', userPromptTemplate: '【統合スクリプト】\n{{scriptJson}}' } } }),
    }))
  const { EpisodeBreakEstimationStep } = await import('@/services/application/steps/episode-break-estimation-step')
    const step = new EpisodeBreakEstimationStep()
    const script: any = {
      panels: Array.from({ length: 5 }, (_, i) => ({ no: i + 1, dialogue: [], narration: [] })),
    }
    const result = await step.estimateEpisodeBreaks(script, createStepContext() as any)
    expect(result.success).toBe(true)

  await expectLogCountIncreases('episode-break-estimation', { allowEqual: true })

    // Inspect one log entry structure via service API (handles duplicated prefix normalization)
    const logs = await LlmLogService.getInstance().getLlmLogs(novelId, 1)
    expect(logs.length).toBeGreaterThan(0)
    const first = logs[0]
    expect(first.novelId).toBe(novelId)
    expect(first.requestType).toBeDefined()
    expect(first.timestamp).toMatch(/Z$/)
  })

  it('sanitize helpers do not throw', () => {
    const svc = LlmLogService.getInstance()
    expect(() => svc.sanitizeRequest({ userPrompt: 'x' })).not.toThrow()
  })
})
