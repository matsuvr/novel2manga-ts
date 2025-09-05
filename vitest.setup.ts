import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Provide a minimal EventSource mock for Node-based tests
class MockEventSource extends EventTarget implements EventSource {
  url: string
  withCredentials: boolean = false
  readyState: number = 0
  onopen: ((this: EventSource, ev: Event) => void) | null = null
  onmessage: ((this: EventSource, ev: MessageEvent) => void) | null = null
  onerror: ((this: EventSource, ev: Event) => void) | null = null

  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  constructor(url: string) {
    super()
    this.url = url
  }

  close(): void {
    // no operation required for tests
  }

  addEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener as EventListener, options)
  }

  removeEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener as EventListener, options)
  }

  dispatchEvent(event: Event): boolean {
    return super.dispatchEvent(event)
  }
}

;(globalThis as { EventSource?: typeof EventSource }).EventSource = MockEventSource

// Mock HTMLCanvasElement globally for all tests
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (contextType: string) => {
    if (contextType === '2d') {
      return {
        fillStyle: '#fff',
        strokeStyle: '#000',
        lineWidth: 2,
        font: '16px sans-serif',
        beginPath: () => {
          /* Mock implementation for test Canvas */
        },
        moveTo: () => {
          /* Mock implementation for test Canvas */
        },
        lineTo: () => {
          /* Mock implementation for test Canvas */
        },
        quadraticCurveTo: () => {
          /* Mock implementation for test Canvas */
        },
        closePath: () => {
          /* Mock implementation for test Canvas */
        },
        fill: () => {
          /* Mock implementation for test Canvas */
        },
        stroke: () => {
          /* Mock implementation for test Canvas */
        },
        fillRect: () => {
          /* Mock implementation for test Canvas */
        },
        strokeRect: () => {
          /* Mock implementation for test Canvas */
        },
        clearRect: () => {
          /* Mock implementation for test Canvas */
        },
        restore: () => {
          /* Mock implementation for test Canvas */
        },
        resetTransform: () => {
          /* Mock implementation for test Canvas */
        },
        save: () => {
          /* Mock implementation for test Canvas */
        },
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'top' as CanvasTextBaseline,
        measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
        fillText: () => {
          /* Mock implementation for test Canvas */
        },
        drawImage: () => {
          /* Mock implementation for test Canvas */
        },
      } as unknown as CanvasRenderingContext2D
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
globalThis.Image = class MockImage {
  width = 100
  height = 100
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
} as typeof Image

// Note: createImageFromBuffer will be mocked per test as needed

// Provide a default mock for the new database factory to avoid brittle test-specific mocks.
// If a test sets up its own `vi.doMock('@/services/database', ...)`, delegate `db` to it.
vi.mock('@/services/database/index', async () => {
  const actual = await vi.importActual<typeof import('@/services/database/index')>(
    '@/services/database/index',
  )

  // Try to delegate to test-provided db (from '@/services/database') if available
  let delegatedDb: unknown
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const wrapper = (await import('@/services/database')) as typeof import('@/services/database')
    // Some tests expose `db` on the wrapper; if so, use it
    delegatedDb = (wrapper as unknown as { db?: unknown }).db
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
    db: (delegatedDb as typeof fallbackDb | undefined) ?? fallbackDb,
  }
})

// Also mock the factory module used by the legacy-compatible DatabaseService wrapper
vi.mock('@/services/database/database-service-factory', () => ({
  db: {
    jobs: () => ({
      getJob: vi.fn().mockReturnValue(null),
      getJobsByNovelId: vi.fn().mockReturnValue([]),
      getJobWithProgress: vi.fn(),
      createJobRecord: vi.fn().mockImplementation(({ id }: { id: string }) => id),
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
