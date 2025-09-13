import '@testing-library/jest-dom'
import { vi } from 'vitest'

// NOTE: 可能な限り型安全にするため ts-nocheck は撤去。
// 環境依存 API / Canvas など最小限の柔軟さが必要な箇所は any キャストで限定対応。

// Minimal safety: ensure process and cwd() are sane if a previous test broke them
try {
  const proc = globalThis.process as unknown as { cwd?: () => unknown }
  const validCwd = typeof proc?.cwd === 'function' && typeof proc.cwd() === 'string'
  if (!validCwd) {
    // Restore from node:process and provide a safe cwd()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const realProc = require('node:process')
    Object.defineProperty(globalThis, 'process', { value: realProc, configurable: true })
    if (typeof realProc.cwd !== 'function') {
      Object.defineProperty(realProc, 'cwd', {
        value: () => realProc.env?.PWD || '/',
        configurable: true,
        writable: true,
      })
    }
  }
} catch {
  // best-effort; do not fail test setup
}

beforeEach(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const realProc = require('node:process')
    Object.defineProperty(globalThis, 'process', { value: realProc, configurable: true })
  } catch {
    // noop
  }
})

// Provide a minimal safety fallback for database module shape so db.render() exists
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./src/services/database') as { db?: Record<string, unknown> }
  if (mod?.db && typeof (mod.db as Record<string, unknown>).render !== 'function') {
    ;(mod.db as Record<string, unknown>).render = () => ({
      getPerEpisodeRenderProgress: async () => ({}),
      getAllRenderStatusByJob: async () => [],
    })
  }
} catch {
  // noop: tests may mock this module; this is only a fallback
}

// Provide a minimal EventSource mock for Node-based tests
class MockEventSource extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  url: string
  withCredentials = false
  readyState = MockEventSource.CONNECTING
  onopen: ((ev: Event) => unknown) | null = null
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  onerror: ((ev: Event) => unknown) | null = null
  constructor(url: string) {
    super()
    this.url = url
  }
  close() {
    /* noop */
  }
}
;(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (contextType: string) => {
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
        closePath: () => {
          /* noop */
        },
        fill: () => {
          /* noop */
        },
        stroke: () => {
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
        measureText: (text: string) => ({ width: text.length * 10 }),
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
;(globalThis as unknown as { Image: new () => unknown }).Image = class MockImage {
  width = 100
  height = 100
  src = ''
  onload: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
}

// Avoid globally mocking '@/config'.
// Individual tests stub specific getters when needed.

// Do not globally mock database. Tests control DB via their own mocks or TestDatabaseManager.

// Removed legacy '@/services/notifications' mock to avoid duplicate differing APIs; using unified '@/services/notification/service'

// NOTE: グローバル通知サービスのモックは削除。
// 実際の NotificationService 実装を使用し、個別テストで必要に応じて spy/mocking する。

// Nodemailer mock to prevent real network usage and provide stable transporter interface
vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
  return {
    default: {
      createTransport: vi.fn(() => ({ sendMail })),
    },
    createTransport: vi.fn(() => ({ sendMail })),
    // expose for tests if they want to inspect
    __mock: { sendMail },
  }
})

import type { Layer } from 'effect'
import { Effect } from 'effect'
import { afterEach, beforeEach } from 'vitest'

// Mock next/server to avoid ESM resolution issues in node test environment
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { vi } = require('vitest')
  vi.mock('next/server', () => require('./src/test/shims/next-server-shim'))
} catch {
  // noop
}

// Default logger mock to satisfy modules calling getLogger().withContext(...)
vi.mock('@/infrastructure/logging/logger', () => {
  const mk = () => ({
    withContext: () => mk(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })
  return {
    getLogger: vi.fn(() => mk()),
    runWithLogContext: async (_ctx: unknown, fn: () => unknown) => await Promise.resolve(fn()),
  }
})

// Do not globally mock CanvasRenderer; tests provide their own mocks where needed.

// Patch '@/config' only to harden prompt getters against missing env; delegate to real module otherwise
vi.mock('@/config', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./src/config/index')
  const safeText = () => {
    try {
      const cfg = actual.getTextAnalysisConfig()
      return {
        ...cfg,
        systemPrompt: cfg?.systemPrompt || 'system: analyze text',
        userPromptTemplate: cfg?.userPromptTemplate || 'text: {{chunkText}}',
      }
    } catch {
      return {
        provider: 'fake',
        maxTokens: 8192,
        systemPrompt: 'system: analyze text',
        userPromptTemplate: 'text: {{chunkText}}',
      }
    }
  }
  const safeScript = () => {
    try {
      const cfg = actual.getScriptConversionConfig()
      return {
        ...cfg,
        systemPrompt: cfg?.systemPrompt || 'system: convert script',
        userPromptTemplate: cfg?.userPromptTemplate || 'input: {{chunkText}}',
      }
    } catch {
      return {
        provider: 'fake',
        maxTokens: 8192,
        systemPrompt: 'system: convert script',
        userPromptTemplate: 'input: {{chunkText}}',
      }
    }
  }
  return {
    ...actual,
    getTextAnalysisConfig: safeText,
    getScriptConversionConfig: safeScript,
  }
})

// Ensure app config function is available with full defaults
vi.mock('@/config/app.config', async (importOriginal) => {
  // Use a relative type import to avoid TS path issues in this standalone setup file
  const actual = await importOriginal<typeof import('./src/config/app.config')>()
  return {
    ...actual,
    getAppConfigWithOverrides: vi.fn(() => actual.appConfig),
  }
})

// Polyfill fs.promises.rm in environments where it's missing (jsdom)
import { promises as fsp } from 'node:fs'

// Polyfill `fs.promises.rm` if missing (type-safe, no `any`)
type FSPromisesWithOptionalRm = typeof fsp & {
  rm?: (path: string, options?: unknown) => Promise<void>
}
const fspWithOptionalRm = fsp as FSPromisesWithOptionalRm
if (typeof fspWithOptionalRm.rm !== 'function') {
  Object.defineProperty(fsp, 'rm', {
    value: async () => {
      /* no-op for tests */
    },
    writable: true,
  })
}

// vitest グローバル (型補助) - test を使用するが jest ではない
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const test: (name: string, fn: () => Promise<unknown>) => void
export async function runEffect<T>(eff: Effect.Effect<T, unknown, never>): Promise<T> {
  return await Effect.runPromise(eff)
}
export function effectTest<T>(name: string, effFactory: () => Effect.Effect<T, unknown, never>) {
  test(name, async () => {
    await runEffect(effFactory())
  })
}
export function withLayer<R, E, A>(layer: Layer.Layer<R, E, A>) {
  return <T>(eff: Effect.Effect<T, E, A>) => Effect.provide(eff, layer)
}

// Important: reset module registry after each test to prevent cross-suite mocks leaking
afterEach(() => {
  try {
    // Avoid global resetModules here because it disrupts per-file vi.mock hoisting
    vi.clearAllMocks()
  } catch {
    // noop
  }
})

// Minimal safe mock for '@/db' to guarantee shouldRunMigrations is available in unit tests
vi.mock('@/db', () => {
  const shouldRunMigrations = (env: NodeJS.ProcessEnv = process.env) => {
    const skip = env?.DB_SKIP_MIGRATE === '1'
    if (skip) return false
    const envName = env?.NODE_ENV
    return envName === 'development' || envName === 'test' || Boolean(env?.VITEST)
  }
  return { shouldRunMigrations, getDatabase: vi.fn(() => ({})) }
})

// Do not globally mock database modules; tests provide their own specific mocks.
