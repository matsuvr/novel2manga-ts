import { describe, expect, it } from 'vitest'
import { TokenUsageDatabaseService } from '@/services/database/token-usage-database-service'
import { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'

describe('TokenUsageDatabaseService', () => {
  it('getTotalsByJobIds aggregates tokens by job', async () => {
    const rows = [
      { jobId: 'job1', promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      { jobId: 'job2', promptTokens: 20, completionTokens: 7, totalTokens: 27 },
    ]

    const db = {
      select: (..._args: unknown[]) => ({
        from: (..._args2: unknown[]) => ({
          where: (..._args3: unknown[]) => ({
            groupBy: (..._args4: unknown[]) => ({ all: () => rows }),
          }),
        }),
      }),
    }

    class MockAdapter extends DatabaseAdapter {
      isSync(): boolean {
        return true
      }

      runSync<T>(fn: () => T): T {
        return fn()
      }

      async transaction<TTx, T>(fn: (tx: TTx) => T | Promise<T>): Promise<T> {
        return fn({} as TTx)
      }
    }

    const service = new TokenUsageDatabaseService(db, new MockAdapter())

    const result = await service.getTotalsByJobIds(['job1', 'job2'])
    expect(result).toEqual({
      job1: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      job2: { promptTokens: 20, completionTokens: 7, totalTokens: 27 },
    })
  })
})
