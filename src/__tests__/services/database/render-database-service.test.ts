import { describe, expect, it } from 'vitest'
import { jobs, renderStatus } from '@/db/schema'
import { RenderDatabaseService } from '@/services/database/render-database-service'

type RenderRow = {
  id: string
  jobId: string
  episodeNumber: number
  pageNumber: number
  isRendered: boolean
  imagePath?: string
  thumbnailPath?: string
  width?: number
  height?: number
  fileSize?: number
  renderedAt: string
}

function makeFakeDb(initialJob: { renderedPages?: number; totalPages?: number }) {
  const state = {
    renderRows: [] as RenderRow[],
    job: {
      id: 'j1',
      renderedPages: initialJob.renderedPages ?? 0,
      totalPages: initialJob.totalPages ?? 0,
      status: 'processing',
      renderCompleted: false,
      updatedAt: '',
    },
  }

  const current = { jobId: '', episodeNumber: 0, pageNumber: 0 }

  const setQuery = (jobId: string, episodeNumber: number, pageNumber: number) => {
    current.jobId = jobId
    current.episodeNumber = episodeNumber
    current.pageNumber = pageNumber
  }

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (_condition: unknown) => ({
          limit: () => ({
            all: () => {
              if (table === jobs) {
                return [
                  {
                    renderedPages: state.job.renderedPages,
                    totalPages: state.job.totalPages,
                  },
                ]
              }
              const row = state.renderRows.find(
                (r) =>
                  r.jobId === current.jobId &&
                  r.episodeNumber === current.episodeNumber &&
                  r.pageNumber === current.pageNumber,
              )
              return row ? [row] : []
            },
          }),
        }),
      }),
    }),

    insert: () => ({ values: (v: unknown) => ({ run: () => state.renderRows.push(v) }) }),
    update: (table?: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: function () {
          if (table === jobs) Object.assign(state.job, vals)
          return this
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          run: () => {
            if (table === renderStatus) {
              const str = JSON.stringify(condition)
              const id = /"id".*?"([^"]+)"/.exec(str)?.[1]
              const row = state.renderRows.find((r) => r.id === id)
              if (row) Object.assign(row, vals)
            } else if (table === jobs) {
              Object.assign(state.job, vals)
            }
          },
        }),
      }),
    }),
  }

  const db = {
    transaction: <T>(fn: (txObj: typeof tx) => T): T => fn(tx),
  } as unknown as Parameters<typeof RenderDatabaseService>[0]

  const adapter = {
    transaction: async <T>(fn: (txObj: typeof tx) => T) => fn(tx),
    runSync: <T>(fn: () => T) => fn(),
    isSync: () => true,
  } as unknown as Parameters<typeof RenderDatabaseService>[1]

  return { db, adapter, state, setQuery }
}

describe('RenderDatabaseService', () => {
  it('increments rendered pages without completing job', async () => {
    const { db, adapter, state } = makeFakeDb({ renderedPages: 0, totalPages: 2 })
    const service = new RenderDatabaseService(db as any, adapter as any)

    await service.upsertRenderStatus('j1', 1, 1, {
      isRendered: true,
      imagePath: '/img1',
    })
    expect(state.job.renderedPages).toBe(1)
    expect(state.job.status).toBe('processing')
    expect(state.job.renderCompleted).toBe(false)
  })

  it('increments rendered pages and sets renderCompleted on final page without changing job status', async () => {
    const { db, adapter, state, setQuery } = makeFakeDb({ renderedPages: 0, totalPages: 2 })
    const service = new RenderDatabaseService(db as any, adapter as any)

    setQuery('j1', 1, 1)
    await service.upsertRenderStatus('j1', 1, 1, {
      isRendered: true,
      imagePath: '/img1',
    })
    expect(state.job.renderedPages).toBe(1)
    expect(state.job.renderCompleted).toBe(false)
    expect(state.job.status).toBe('processing')

    setQuery('j1', 1, 2)
    await service.upsertRenderStatus('j1', 1, 2, {
      isRendered: true,
      imagePath: '/img2',
    })
    expect(state.job.renderedPages).toBe(2)
    expect(state.job.renderCompleted).toBe(true)
    expect(state.job.status).toBe('processing')
  })
})
