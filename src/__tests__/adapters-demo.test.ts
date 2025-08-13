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
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, jobId: 'job-1', chunkCount: 1, mode: 'demo' }) }) as any
		const out = await demoAnalyze({ baseUrl })
		expect(out.jobId).toBe('job-1')
	})

	it('demoLayout returns storageKey', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, storageKey: 'k' }) }) as any
		const out = await demoLayout({ baseUrl, jobId: 'job', episodeNumber: 1 })
		expect(out.storageKey).toBe('k')
	})

	it('demoRender returns renderKey', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, renderKey: 'r' }) }) as any
		const out = await demoRender({ baseUrl, jobId: 'job', episodeNumber: 1, pageNumber: 1 })
		expect(out.renderKey).toBe('r')
	})
})


