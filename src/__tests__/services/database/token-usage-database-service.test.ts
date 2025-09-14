import { describe, expect, it } from 'vitest'
import { TokenUsageDatabaseService } from '@/services/database/token-usage-database-service'

describe('TokenUsageDatabaseService', () => {
  it('getTotalsByJobIds aggregates tokens by job', async () => {
    const rows = [
      { jobId: 'job1', promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      { jobId: 'job2', promptTokens: 20, completionTokens: 7, totalTokens: 27 },
    ]

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            groupBy: () => ({ all: () => rows }),
          }),
        }),
      }),
    }
    const adapter = { isSync: () => true, transaction: (fn: (tx: unknown) => unknown) => fn({}) }
    const service = new TokenUsageDatabaseService(db as any, adapter as any)

    const result = await service.getTotalsByJobIds(['job1', 'job2'])
    expect(result).toEqual({
      job1: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      job2: { promptTokens: 20, completionTokens: 7, totalTokens: 27 },
    })
  })
})
