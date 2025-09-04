import { describe, expect, it } from 'vitest'
import { RenderDatabaseService } from '@/services/database/render-database-service'

function makeFakeDb(initialJob: { renderedPages?: number; totalPages?: number } = {}) {
  const state = {
    renderRows: [] as unknown[],
    job: { renderedPages: initialJob.renderedPages ?? 0, totalPages: initialJob.totalPages ?? 0 },
  }
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => ({ all: () => state.renderRows }) }),
      }),
    }),
    insert: () => ({ values: (v: unknown) => ({ run: () => void state.renderRows.push(v) }) }),
    update: () => ({ set: () => ({ where: () => ({ run: () => void 0 }) }) }),
  }
  const db = {
    transaction: <T>(cb: (txObj: typeof tx) => T): T => cb(tx),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => ({ all: () => [state.job] }) }),
      }),
    }),
  }
  const adapter = {
    isSync: () => true,
    transaction: <T>(cb: () => T) => cb(),
    executeAsync: async <T>(cb: () => T) => cb(),
  }
  return {
    db: db as unknown as Parameters<typeof RenderDatabaseService>[0],
    adapter: adapter as unknown as Parameters<typeof RenderDatabaseService>[1],
    state,
  }
}

describe('RenderDatabaseService', () => {
  it('upsertRenderStatus can insert a new row', () => {
    const { db, adapter } = makeFakeDb({ renderedPages: 0, totalPages: 10 })
    const service = new RenderDatabaseService(db, adapter)
    service.upsertRenderStatus('j1', 1, 1, { isRendered: true, imagePath: '/img' })
  })
})
