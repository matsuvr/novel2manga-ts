import fs, { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Intentionally avoid early importing generator to let module-mocks take effect

// Mocks for provider config and router
vi.mock('@/config/llm.config', async () => {
  return {
    getLLMProviderConfig: vi.fn((_prov: string) => ({
      apiKey: 'test-key',
      model: 'test-model',
      maxTokens: 128,
    })),
  }
})

describe('LLM deduplication and retry logging', () => {
  const schema = z.object({ ok: z.boolean() })
  let originalLogging: string | undefined
  let originalPath: string | undefined
  let tempDir: string

  beforeEach(() => {
    originalLogging = process.env.LLM_LOGGING
    originalPath = process.env.LLM_LOGGING_PATH
    tempDir = mkdtempSync(path.join(tmpdir(), 'llm-dedup-retry-'))
  })

  afterEach(() => {
    if (typeof originalLogging === 'string') process.env.LLM_LOGGING = originalLogging
    else delete process.env.LLM_LOGGING
    if (typeof originalPath === 'string') process.env.LLM_LOGGING_PATH = originalPath
    else delete process.env.LLM_LOGGING_PATH
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    vi.resetAllMocks()
  })

  it('coalesces concurrent identical requests (single underlying call)', async () => {
    let callCount = 0
    // mock router to return a shared fake client
    vi.doMock('@/agents/llm/router', async () => {
      const mod = await vi.importActual<typeof import('@/agents/llm/router')>('@/agents/llm/router')
      // Provide a fake client with small delay
      const fakeClient = {
        provider: 'fake' as const,
        async generateStructured<T>(params: { spec: { schema: z.ZodTypeAny } }): Promise<T> {
          callCount += 1
          await new Promise((r) => setTimeout(r, 30))
          return params.spec.schema.parse({ ok: true }) as T
        },
      }
      return {
        ...mod,
        createClientForProvider: vi.fn(() => fakeClient as unknown as import('@/agents/llm/types').LlmClient),
      }
    })

    // Re-import generator with mocked router
    const { DefaultLlmStructuredGenerator: Gen } = await import('@/agents/structured-generator')
    const gen = new Gen(['fake'])

    const p1 = gen.generateObjectWithFallback({
      name: 'test',
      systemPrompt: 'sys',
      userPrompt: 'same',
      schema,
      schemaName: 'TestSchema',
    })
    const p2 = gen.generateObjectWithFallback({
      name: 'test',
      systemPrompt: 'sys',
      userPrompt: 'same',
      schema,
      schemaName: 'TestSchema',
    })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ ok: true })
    expect(r2).toEqual({ ok: true })
    expect(callCount).toBe(1)
  })

  it('writes retryAttempt to structured logs on retry', async () => {
    // ensure a fresh module graph so the new router mock is used
    vi.resetModules()
    process.env.LLM_LOGGING = '1'
    const logPath = path.join(tempDir, 'llm-interactions.log')
    process.env.LLM_LOGGING_PATH = logPath
    // ensure file exists to avoid ENOENT on slow CI
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    try { fs.writeFileSync(logPath, '') } catch {}

    let attempt = 0
    vi.doMock('@/agents/llm/router', async () => {
      const logging = await vi.importActual<typeof import('@/agents/llm/logging')>('@/agents/llm/logging')
      const fakeClient = {
        provider: 'fake' as const,
        async generateStructured<T>(params: { spec: { schema: z.ZodTypeAny } }): Promise<T> {
          attempt += 1
          if (attempt === 1) {
            // retriable JSON error pattern
            throw new Error('schema validation failed: expected object')
          }
          return params.spec.schema.parse({ ok: true }) as T
        },
      }
      return {
        ...(await vi.importActual<typeof import('@/agents/llm/router')>('@/agents/llm/router')),
        createClientForProvider: vi.fn(() => logging.maybeWrapStructuredLogging(
          fakeClient as unknown as import('@/agents/llm/types').LlmClient,
        )),
      }
    })

  const { DefaultLlmStructuredGenerator: Gen } = await import('@/agents/structured-generator')
    const gen = new Gen(['fake'])
    const res = await gen.generateObjectWithFallback({
      name: 'retry-test',
      systemPrompt: 'sys',
      userPrompt: 'needs-retry',
      schema,
      schemaName: 'TestSchema',
    })
    expect(res).toEqual({ ok: true })

    // wait until we have at least 2 lines (first error + second success)
    const start = Date.now()
    let lines: string[] = []
    while (Date.now() - start < 2000) {
      try {
        const raw = fs.readFileSync(logPath, 'utf8').trim()
        lines = raw.split('\n').filter(Boolean)
        if (lines.length >= 2) break
      } catch {}
      await new Promise((r) => setTimeout(r, 25))
    }
    // first attempt failed -> logged with error; second attempt succeeded -> logged with response
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const first = JSON.parse(lines[0]) as any
    const second = JSON.parse(lines[1]) as any
    expect(first.kind).toBe('structured')
    expect(second.kind).toBe('structured')
    expect(first.prompt.telemetry?.retryAttempt).toBe(1)
    expect(second.prompt.telemetry?.retryAttempt).toBe(2)
    expect(first.prompt.telemetry?.cacheHit ?? false).toBe(false)
    expect(second.prompt.telemetry?.cacheHit ?? false).toBe(false)
  })
})
