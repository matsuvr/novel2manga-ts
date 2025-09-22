import { Effect } from 'effect'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// 先にモックを定義し、以降の import で利用されるようにする
const novelId = 'testnovel123'
vi.mock('@/utils/job', () => {
  return {
    getNovelIdForJob: vi.fn(async () => novelId),
  }
})

import { chunkConversionEffect } from '@/agents/chunk-conversion'
import { getLogger } from '@/infrastructure/logging/logger'
import { EpisodeBreakEstimationStep } from '@/services/application/steps/episode-break-estimation-step'
import { InputValidationStep } from '@/services/application/steps/input-validation-step'
import { LlmLogService } from '@/services/llm/log-service'
import { clearStorageCache, getLlmLogStorage } from '@/utils/storage'

// このテストは LLM 実呼び出しを避けるため provider=fake 前提 (CIで高速)
// fake provider が構造化生成を返しログ保存ラッパーが動作することのみを検証

describe('LLM logging integration (fake provider)', () => {
  const jobId = 'job123'
  let previousCount = 0

  beforeAll(async () => {
    clearStorageCache()
  })

  async function expectLogCountIncreases(stepLabel: string) {
    const storage = await getLlmLogStorage()
    const keys = (await storage.list?.(novelId + '/')) || []
    expect(keys.length, `${stepLabel}: log count should increase`).toBeGreaterThan(previousCount)
    previousCount = keys.length
  }

  it('logs narrativity judge call', async () => {
    const step = new InputValidationStep()
    const res = await step.validate('これはテスト用の物語本文です。登場人物がいて出来事が起こります。', {
      jobId,
      logger: getLogger(),
    } as any)
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
    const step = new EpisodeBreakEstimationStep()
    const script: any = {
      panels: Array.from({ length: 5 }, (_, i) => ({ no: i + 1, dialogue: [], narration: [] })),
    }
    const result = await step.estimateEpisodeBreaks(script, {
      jobId,
      logger: getLogger(),
    } as any)
    expect(result.success).toBe(true)

    await expectLogCountIncreases('episode-break-estimation')

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
