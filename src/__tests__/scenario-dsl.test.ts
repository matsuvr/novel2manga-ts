import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'
import { runScenario, ScenarioBuilder } from '@/services/orchestrator/scenario'
import {
  zChunkOutput,
  zComposeOutput,
  zImageResult,
  zIngestOutput,
  zReduceOutput,
  zStoryboardOutput,
  zWindowAnalysis,
} from '@/types/contracts'

// 外部API呼び出しを行うアダプタをモック（シナリオ実行を純粋化）
vi.mock('@/services/adapters', () => ({
  prodAnalyze: vi.fn(async (_args: { baseUrl: string; text?: string; novelId?: string }) => ({
    baseUrl: 'http://localhost:3000',
    jobId: 'job-test-1',
    chunkCount: 3,
  })),
  prodLayout: vi.fn(async (_args: { baseUrl: string; jobId: string; episodeNumber: number }) => ({
    baseUrl: 'http://localhost:3000',
    jobId: 'job-test-1',
    episodeNumber: 1,
    storageKey: 'layouts/job-test-1/episode_1.yaml',
  })),
  prodRender: vi.fn(
    async (_args: {
      baseUrl: string
      jobId: string
      episodeNumber: number
      pageNumber: number
    }) => ({
      jobId: 'job-test-1',
      episodeNumber: 1,
      pageNumber: 1,
      renderKey: 'renders/job-test-1/ep1/page_1.png',
      thumbnailKey: 'renders/job-test-1/ep1/page_1_thumb.png',
    }),
  ),
}))

describe('Scenario DSL', () => {
  it('builds and runs the novel-to-manga flow in memory', async () => {
    const scenario = createNovelToMangaScenario()

    // Basic shape assertions
    expect(scenario.id).toBe('novel-to-manga')
    const stepIds = new Set(scenario.steps.map((s) => s.id))
    for (const id of ['analyze', 'layout', 'render']) {
      expect(stepIds.has(id)).toBe(true)
    }

    // Execute with a small initial input
    const outputs = await runScenario(scenario, {
      initialInput: {
        baseUrl: 'http://localhost:3000',
        text: 'テスト本文',
      },
    })

    // Ensure key stages produced outputs (現行APIオーケストレーション版の検証)
    const analyzeOut = z
      .object({ baseUrl: z.string().url(), jobId: z.string(), chunkCount: z.number().optional() })
      .parse(outputs['analyze'])
    expect(analyzeOut.jobId.length).toBeGreaterThan(0)
    const layoutOut = z
      .object({
        baseUrl: z.string().url(),
        jobId: z.string(),
        episodeNumber: z.number().int().positive(),
        storageKey: z.string(),
      })
      .parse(outputs['layout'])
    expect(layoutOut.storageKey.length).toBeGreaterThan(0)
    const renderOut = z
      .object({
        jobId: z.string(),
        episodeNumber: z.number().int().positive(),
        pageNumber: z.number().int().positive(),
        renderKey: z.string(),
        thumbnailKey: z.string().optional(),
      })
      .parse(outputs['render'])
    expect(renderOut.renderKey.length).toBeGreaterThan(0)
  })

  it('detects cycle in scenario definition', () => {
    const b = new ScenarioBuilder('cycle-test', '1.0.0')
    const schema = z.object({ v: z.number() })
    b.step({
      id: 'a',
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    })
    b.step({
      id: 'b',
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    })
    b.edge({ from: 'a', to: 'b', fanIn: 'all' })
    b.edge({ from: 'b', to: 'a', fanIn: 'all' })
    expect(() => b.build()).toThrow(/cycle/i)
  })

  it('fails on invalid edge reference', () => {
    const b = new ScenarioBuilder('invalid-edge', '1.0.0')
    const schema = z.object({ v: z.number() })
    b.step({
      id: 'only',
      inputSchema: schema,
      outputSchema: schema,
      idempotencyFrom: [],
      run: async (i) => i,
    })
    b.edge({ from: 'only', to: 'missing', fanIn: 'all' })
    expect(() => b.build()).toThrow(/Edge.to not found/i)
  })

  it('validates input and output schemas and retries on failure', async () => {
    let attempts = 0
    const b = new ScenarioBuilder('retry-test', '1.0.0')
    const inSchema = z.object({ n: z.number().int().positive() })
    const outSchema = z.object({ doubled: z.number().int() })
    b.step({
      id: 'double',
      inputSchema: inSchema,
      outputSchema: outSchema,
      retry: { maxAttempts: 2, backoffMs: 1, factor: 1, jitter: false },
      idempotencyFrom: ['n'],
      run: async (input) => {
        const parsed = inSchema.parse(input)
        attempts++
        if (attempts === 1) throw new Error('transient')
        return { doubled: parsed.n * 2 }
      },
    })
    const scenario = b.build()
    const outputs = await runScenario(scenario, { initialInput: { n: 5 } })
    expect(outputs.double).toEqual({ doubled: 10 })
    expect(attempts).toBe(2)
  })

  it('collects errors when collectErrors enabled', async () => {
    const b = new ScenarioBuilder('error-test', '1.0.0')
    const inSchema = z.object({ ok: z.boolean() })
    b.step({
      id: 'alwaysFail',
      inputSchema: inSchema,
      outputSchema: inSchema,
      retry: { maxAttempts: 2, backoffMs: 1, factor: 1, jitter: false },
      idempotencyFrom: ['ok'],
      run: async () => {
        throw new Error('boom')
      },
    })
    const scenario = b.build()
    const outputs = await runScenario(scenario, {
      initialInput: { ok: true },
      collectErrors: true,
    })
    expect(outputs.alwaysFail).toBeInstanceOf(Error)
  })
})
