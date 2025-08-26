import { describe, it, expect, vi, beforeEach } from 'vitest'

// LLM 構造化ジェネレーターをモック（エピソード候補を返さないケース）
vi.mock('@/agents/structured-generator', () => ({
  getLlmStructuredGenerator: () => ({
    generateObjectWithFallback: vi.fn().mockResolvedValue({ episodes: [] }),
  }),
}))

import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { EpisodeBundlingStep } from '@/services/application/steps/episode-bundling-step'

describe('EpisodeBundlingStep: advisory 20–50 pages (no hard reject)', () => {
  const jobId = 'job-fallback-under-20'

  beforeEach(async () => {
    // full_pages.json を10ページで用意
    const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
    const layoutStorage = await StorageFactory.getLayoutStorage()
    const fullLayout = {
      pages: Array.from({ length: 10 }).map((_, i) => ({
        page_number: i + 1,
        panels: [],
      })),
    }
    await layoutStorage.put(JsonStorageKeys.fullPages(jobId), JSON.stringify(fullLayout), {
      contentType: 'application/json; charset=utf-8',
      jobId,
    })
  })

  it('falls back to a single episode when total pages < 20 and no proposals', async () => {
    const logger = getLogger()
    const ports = getStoragePorts()
    const step = new EpisodeBundlingStep()

    const result = await step.bundleFromFullPages({
      jobId,
      novelId: 'novel-x',
      logger,
      ports,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.episodes).toEqual([1])

      // 出力エピソードのレイアウトが保存されていることを確認
      const layoutJson = await ports.layout.getEpisodeLayout(jobId, 1)
      expect(layoutJson).not.toBeNull()
      const parsed = JSON.parse(layoutJson as string) as { pages: unknown[] }
      expect(Array.isArray(parsed.pages)).toBe(true)
      expect(parsed.pages.length).toBe(10)
    }
  })
})
