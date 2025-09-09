import { describe, expect, it } from 'vitest'
import { getChunkSummaryConfig } from '@/config/chunk-summary.config'
import { getStoredSummary, loadOrGenerateSummary } from '@/utils/chunk-summary'

process.env.N2M_MOCK_LLM = '1'

describe('chunk summary utility', () => {
  it('generates and caches summary', async () => {
    const jobId = `job-${Date.now()}`
    const text = 'これはテスト用の長いテキストです。要約されるべき内容がここにあります。'
    const summary = await loadOrGenerateSummary(jobId, 0, text)
    expect(typeof summary).toBe('string')
    const config = getChunkSummaryConfig()
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThanOrEqual(config.maxLength)
    const cached = await getStoredSummary(jobId, 0)
    expect(cached).toBe(summary)
  })
})
