import { describe, expect, it } from 'vitest'
import { jobs, renderStatus } from '@/db/schema'
import { RenderDatabaseService } from '@/services/database/render-database-service'

function makeFakeDb(initialJob: { renderedPages?: number; totalPages?: number } = {}) {
  const state = {
    renderRows: [] as unknown[],
    job: {
      renderedPages: initialJob.renderedPages ?? 0,
      totalPages: initialJob.totalPages ?? 0,
      status: 'processing' as string,
      renderCompleted: false,
    },
  }

  const tx = {
    select: () => ({
      from: (table?: unknown) => ({
        where: () => ({
          limit: () => (table === jobs ? [state.job] : []),
        }),
      }),
    }),
    insert: () => ({ values: (v: unknown) => ({ run: () => state.renderRows.push(v) }) }),
    update: (table?: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: function () {
          if (table === jobs) Object.assign(state.job, vals)
          return this;
        },
      }),
    }),
  }

  const db = {} as unknown as Parameters<typeof RenderDatabaseService>[0]
  const adapter = {
    isSync: () => false,
    transaction: async <T>(cb: (txObj: typeof tx) => T) => cb(tx),
  } as unknown as Parameters<typeof RenderDatabaseService>[1]

  return { db, adapter, state }
}

describe('RenderDatabaseService', () => {
  it('increments rendered pages without completing job', async () => {
    const { db, adapter, state } = makeFakeDb({ renderedPages: 0, totalPages: 2 })
  it('increments rendered pages and sets renderCompleted on final page without changing job status', async () => {

    await service.upsertRenderStatus('j1', 1, 1, {
      isRendered: true,
      imagePath: '/img1',
    })
    expect(state.job.renderedPages).toBe(1)
    expect(state.job.status).toBe('processing')

    await service.upsertRenderStatus('j1', 1, 2, {
      isRendered: true,
      imagePath: '/img2',
    })

    expect(state.job.renderedPages).toBe(2)
    expect(state.job.status).toBe('processing')
    expect(state.job.renderCompleted).toBe(true)
  })
})
