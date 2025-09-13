// integration copy for vitest include path
import { describe, expect, it, vi } from 'vitest'
import { NovelDatabaseService } from '@/services/database/novel-database-service'

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'test-uuid-123'),
})

function makeFakeDb() {
  const calls: Record<string, unknown[]> = {}
  const tx = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => ({
          run: () => {
            calls.insert = [v]
            return undefined
          },
        }),
        run: () => {
          calls.insert = [v]
          return undefined
        },
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ run: () => undefined }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ all: () => [] }) }) }) }),
  }
  const db = {
    transaction: <T>(cb: (txObj: typeof tx) => T): T => cb(tx),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => ({ all: () => [] as unknown[] }) }),
        orderBy: () => ({ all: () => [] as unknown[] }),
      }),
    }),
  }
  const adapter = {
    isSync: () => true,
    transaction: <T>(cb: () => T) => cb(),
    executeAsync: async <T>(cb: () => T) => cb(),
  }
  return {
    db: db as unknown as Parameters<typeof NovelDatabaseService.prototype.createNovel>[0],
    adapter: adapter as unknown as any,
    calls,
  }
}

describe('NovelDatabaseService (examples path)', () => {
  it('createNovel returns a Novel object with generated id', async () => {
    const { db, adapter } = makeFakeDb()
    const service = new NovelDatabaseService(db as any, adapter as any)
    const novel = await service.createNovel({
      userId: 'u1',
      title: 't',
      author: 'a',
      originalTextPath: '/x',
      textLength: 10,
      language: 'ja',
      metadataPath: '/m',
    })
    expect(typeof novel.id).toBe('string')
    expect(novel.id).toBe('test-uuid-123')
    expect(novel.userId).toBe('u1')
    expect(novel.title).toBe('t')
  })
})
