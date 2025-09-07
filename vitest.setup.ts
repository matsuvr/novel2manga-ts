// @ts-nocheck
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Provide a minimal EventSource mock for Node-based tests
class MockEventSource extends EventTarget {
  url
  withCredentials = false
  readyState = 0
  onopen = null
  onmessage = null
  onerror = null

  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  constructor(url) {
    super()
    this.url = url
  }

  close() {
    // no operation required for tests
  }

  addEventListener(type, listener, options) {
    // delegate to EventTarget while keeping loose types for test env
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super.addEventListener(type, listener, options)
  }

  removeEventListener(type, listener, options) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super.removeEventListener(type, listener, options)
  }

  dispatchEvent(event) {
    return super.dispatchEvent(event)
  }
}

globalThis /** @type {any} */.EventSource = MockEventSource

// Mock HTMLCanvasElement globally for all tests
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (contextType) => {
    if (contextType === '2d') {
      return {
        fillStyle: '#fff',
        strokeStyle: '#000',
        lineWidth: 2,
        font: '16px sans-serif',
        beginPath: () => {
          /* noop */
        },
        moveTo: () => {
          /* noop */
        },
        lineTo: () => {
          /* noop */
        },
        quadraticCurveTo: () => {
          /* noop */
        },
        ellipse: () => {
          /* noop */
        },
        arc: () => {
          /* noop */
        },
        closePath: () => {
          /* noop */
        },
        fill: () => {
          /* noop */
        },
        stroke: () => {
          /* noop */
        },
        strokeText: () => {
          /* noop */
        },
        fillRect: () => {
          /* noop */
        },
        strokeRect: () => {
          /* noop */
        },
        clearRect: () => {
          /* noop */
        },
        restore: () => {
          /* noop */
        },
        resetTransform: () => {
          /* noop */
        },
        save: () => {
          /* noop */
        },
        textAlign: 'left',
        textBaseline: 'top',
        measureText: (text) => ({ width: text.length * 10 }),
        fillText: () => {
          /* noop */
        },
        drawImage: () => {
          /* noop */
        },
      }
    }
    return null
  },
  writable: true,
})

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: () => 'data:image/png;base64,iVBORw0KGgo=',
  writable: true,
})

// Mock global functions that might be used by Canvas-related code
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
globalThis /** @type {any} */.Image = class MockImage {
  width = 100
  height = 100
  src = ''
  onload = null
  onerror = null
}

// Note: createImageFromBuffer will be mocked per test as needed

// Provide a default mock for the new database factory to avoid brittle test-specific mocks.
// If a test sets up its own `vi.doMock('@/services/database', ...)`, delegate `db` to it.
vi.mock('@/services/database/index', async () => {
  const actual = await vi.importActual('@/services/database/index')

  // Try to delegate to test-provided db (from '@/services/database') if available
  let delegatedDb: unknown
  try {
    const wrapper = await import('@/services/database')
    delegatedDb = /** @type {any} */ wrapper.db
  } catch {
    // noop: fallback to stubbed db below
  }

  const fallbackDb = {
    jobs: () => ({
      getJob: vi.fn().mockResolvedValue({ id: 'job1', novelId: 'novel1' }),
      getJobsByNovelId: vi.fn().mockReturnValue([]),
      getJobWithProgress: vi.fn(),
      updateJobStatus: vi.fn(),
      updateJobStep: vi.fn(),
      markJobStepCompleted: vi.fn(),
      updateJobTotalPages: vi.fn(),
      updateJobError: vi.fn(),
      updateProcessingPosition: vi.fn(),
    }),
    episodes: () => ({
      getEpisodesByJobId: vi.fn().mockReturnValue([]),
      updateEpisodeTextPath: vi.fn(),
      createEpisodes: vi.fn(),
    }),
    chunks: () => ({
      getChunksByJobId: vi.fn().mockReturnValue([]),
      createChunk: vi.fn().mockResolvedValue('chunk-id'),
    }),
    novels: () => ({
      ensureNovel: vi.fn(),
      getNovel: vi.fn(),
      getAllNovels: vi.fn().mockReturnValue([]),
      createNovel: vi.fn().mockResolvedValue({ id: 'novel-id' }),
    }),
    render: () => ({
      upsertRenderStatus: vi.fn(),
      getAllRenderStatusByJob: vi.fn().mockReturnValue([]),
    }),
    layout: () => ({
      upsertLayoutStatus: vi.fn(),
    }),
    outputs: () => ({
      createOutput: vi.fn().mockResolvedValue('output-id'),
      getOutput: vi.fn(),
    }),
  }

  return {
    ...actual,
    db: delegatedDb ?? fallbackDb,
  }
})

// Also mock the factory module used by the legacy-compatible DatabaseService wrapper
vi.mock('@/services/database/database-service-factory', () => ({
  db: {
    jobs: () => ({
      getJob: vi.fn().mockReturnValue(null),
      getJobsByNovelId: vi.fn().mockReturnValue([]),
      getJobWithProgress: vi.fn(),
      createJobRecord: vi.fn().mockImplementation(({ id }) => id),
      updateJobStatus: vi.fn(),
      updateJobStep: vi.fn(),
      markJobStepCompleted: vi.fn(),
      updateJobTotalPages: vi.fn(),
      updateJobError: vi.fn(),
      updateProcessingPosition: vi.fn(),
    }),
    episodes: () => ({
      getEpisodesByJobId: vi.fn().mockReturnValue([]),
      updateEpisodeTextPath: vi.fn(),
      createEpisodes: vi.fn(),
    }),
    chunks: () => ({
      getChunksByJobId: vi.fn().mockReturnValue([]),
      createChunk: vi.fn().mockResolvedValue('chunk-id'),
    }),
    novels: () => ({
      ensureNovel: vi.fn(),
      getNovel: vi.fn(),
      getAllNovels: vi.fn().mockReturnValue([]),
      createNovel: vi.fn().mockResolvedValue({ id: 'novel-id' }),
    }),
    render: () => ({
      upsertRenderStatus: vi.fn(),
      getAllRenderStatusByJob: vi.fn().mockReturnValue([]),
    }),
    layout: () => ({
      upsertLayoutStatus: vi.fn(),
    }),
    outputs: () => ({
      createOutput: vi.fn().mockResolvedValue('output-id'),
      getOutput: vi.fn(),
    }),
  },
  DatabaseServiceFactory: class {},
  getDatabaseServiceFactory: vi.fn(),
  initializeDatabaseServiceFactory: vi.fn(),
  isFactoryInitialized: vi.fn(() => true),
  cleanup: vi.fn(),
}))
