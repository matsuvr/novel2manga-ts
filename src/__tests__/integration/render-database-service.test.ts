import { describe, expect, it, vi } from 'vitest'
import { RenderDatabaseService } from '@/services/database/render-database-service'

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'render-uuid-1'),
})

function makeFakeDb() {
  const tx = {
    insert: () => ({ values: () => ({ run: () => undefined }) }),
    update: () => ({ set: () => ({ where: () => ({ run: () => undefined }) }) }),
    select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }),
  }
  const db = {
    transaction: <T>(cb: (t: typeof tx) => T) => cb(tx),
  }
  const adapter = { isSync: () => true }
  return { db: db as any, adapter: adapter as any }
}

describe('RenderDatabaseService', () => {
  it('createRenderEntry creates an entry and returns id', async () => {
    const { db, adapter } = makeFakeDb()
    const service = new RenderDatabaseService(db as any, adapter as any)
    const res = await (service as any).createRenderEntry({
      jobId: 'j1',
      pageCount: 3,
      requestedBy: 'u1',
      settings: {},
    })
    expect(res).toBeDefined()
  })
})
