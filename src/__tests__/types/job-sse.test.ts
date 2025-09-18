import { describe, expect, it } from 'vitest'
import { parseJobSSEPayload } from '@/types/job-sse'

describe('JobSSE payload parsing', () => {
  it('accepts nulls for nullable job fields', () => {
    const payload = JSON.stringify({
      job: {
        id: 'job-1',
        status: 'processing',
        processedEpisodes: null,
        totalEpisodes: null,
        renderedPages: null,
        totalPages: null,
        processingEpisode: null,
        processingPage: null,
        lastError: null,
        lastErrorStep: null,
      },
    })

    const parsed = parseJobSSEPayload(payload)

    expect(parsed).toBeDefined()
    expect(parsed.job).toBeDefined()
    expect(parsed.job.id).toBe('job-1')
    // The fields should be present and either null or undefined (nullish)
    // Using any casts to satisfy TS access in tests
    const j: any = parsed.job
    expect(j.processedEpisodes === null || j.processedEpisodes === undefined).toBe(true)
    expect(j.processingEpisode === null || j.processingEpisode === undefined).toBe(true)
    expect(j.lastError === null || j.lastError === undefined).toBe(true)
  })
})
