import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoAnalyze, demoLayout, demoRender } from '@/services/adapters'

const baseUrl = 'http://localhost:3000'

describe('demo adapters', () => {
  const originalFetch = global.fetch
  beforeEach(() => {
    vi.resetAllMocks()
  })
  afterEach(() => {
    global.fetch = originalFetch as any
  })

  it('demoAnalyze parses jobId from multiple shapes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, jobId: 'job-1', chunkCount: 1, mode: 'demo' }),
    }) as any
    const out = await demoAnalyze({ baseUrl })
    expect(out.jobId).toBe('job-1')
  })

  it('demoLayout returns storageKey', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, storageKey: 'k' }),
    }) as any
    const out = await demoLayout({ baseUrl, jobId: 'job', episodeNumber: 1 })
    expect(out.storageKey).toBe('k')
  })

  it('demoRender returns renderKey', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, renderKey: 'r' }) }) as any
    const out = await demoRender({ baseUrl, jobId: 'job', episodeNumber: 1, pageNumber: 1 })
    expect(out.renderKey).toBe('r')
  })

  it('handles malformed JSON gracefully', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('Invalid JSON')) }) as any
    await expect(demoAnalyze({ baseUrl })).rejects.toThrow('Invalid JSON')
  })

  it('handles network failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    await expect(demoAnalyze({ baseUrl })).rejects.toThrow('[demoAnalyze] failed: 500')
  })

  it('handles missing jobId in demoLayout', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as any
    await expect(demoLayout({ baseUrl, jobId: 'job', episodeNumber: 1 })).rejects.toThrow(
      '[demoLayout] storageKey missing in response',
    )
  })

  it('handles missing renderKey in demoRender', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as any
    await expect(
      demoRender({ baseUrl, jobId: 'job', episodeNumber: 1, pageNumber: 1 }),
    ).rejects.toThrow('[demoRender] renderKey missing in response')
  })
})
