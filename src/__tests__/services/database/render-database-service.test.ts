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
  // In-memory mutable state representing rows
  const state = {
    renderRows: [] as RenderRow[],
    job: {
      id: 'j1',
      renderedPages: initialJob.renderedPages ?? 0,
      totalPages: initialJob.totalPages ?? 0,
      status: 'processing' as string,
      renderCompleted: false,
      updatedAt: '',
    },
  }

  // Query cursor (simple emulation of where conditions used in service)
  const current = { jobId: '', episodeNumber: 0, pageNumber: 0 }

  const setQuery = (jobId: string, episodeNumber: number, pageNumber: number) => {
    current.jobId = jobId
    current.episodeNumber = episodeNumber
    current.pageNumber = pageNumber
  }

  // Minimal Drizzle-like chain builders used in service
  type Tx = {
    select: () => {
      from: (table: unknown) => {
        where: (_condition: unknown) => {
          limit: (n?: number) => {
            all: () => unknown[]
          }
          groupBy?: (..._cols: unknown[]) => unknown
          orderBy?: (..._cols: unknown[]) => unknown
        }
        orderBy?: (..._cols: unknown[]) => unknown
        groupBy?: (..._cols: unknown[]) => unknown
      }
    }
    insert: (table: unknown) => {
      values: (v: RenderRow) => { run: () => void }
    }
    update: (table: unknown) => {
      set: (vals: Record<string, unknown>) => {
        where: (condition: unknown) => { run: () => void }
      }
    }
    delete?: (table: unknown) => { where: (_c: unknown) => { run: () => void } }
  }

  const tx: Tx = {
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
    insert: () => ({
      values: (v: RenderRow) => ({
        run: () => {
          state.renderRows.push(v)
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

  // Fake database exposing transaction similar to BetterSQLite3Database
  const db = {
    transaction: <T>(fn: (txObj: Tx) => T): T => fn(tx),
  } as unknown as { transaction: <T>(fn: (txObj: Tx) => T) => T }

  // Adapter fulfilling DatabaseAdapter contract surface used by service
  const adapter = {
    transaction: async <T>(fn: (txObj: Tx) => T) => fn(tx),
    runSync: <T>(fn: () => T) => fn(),
    isSync: () => true,
  }

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
