import { describe, it, expect, vi } from 'vitest'

import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { RetryableError } from '@/errors/retryable-error'

describe('JobNarrativeProcessor retry logic', () => {
  const dbService = {} as any

  it('retries when RetryableError is thrown', async () => {
    const processor = new JobNarrativeProcessor(dbService, { maxRetries: 2, retryDelay: 0 })
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new RetryableError('temporary'))
      .mockResolvedValueOnce('success')

    const result = await (processor as any).executeWithRetry(operation, 'test')
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry on non-retryable errors', async () => {
    const processor = new JobNarrativeProcessor(dbService, { maxRetries: 2, retryDelay: 0 })
    const operation = vi.fn().mockRejectedValue(new Error('fatal'))

    await expect(
      (processor as any).executeWithRetry(operation, 'test'),
    ).rejects.toThrow('fatal')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
