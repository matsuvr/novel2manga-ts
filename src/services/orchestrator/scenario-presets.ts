import { z } from 'zod'
import { ScenarioBuilder } from '@/services/orchestrator/scenario'

// シナリオDSL廃止後に残したい API ベースの簡易オーケストレーション用プリセット
// - demo / prod / test の3種

export function createDemoApiScenario() {
  const b = new ScenarioBuilder('demo-api', '1.0.0')

  b.step({
    id: 'analyze-demo',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      text: z.string().optional(),
      novelId: z.string().optional(),
    }),
    outputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      mode: z.enum(['demo']).optional(),
      chunkCount: z.number().int().nonnegative().optional(),
    }),
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'text', 'novelId'],
    run: async (input: unknown) => {
      const { demoAnalyze } = await import('@/services/adapters')
      return demoAnalyze(input as { baseUrl: string; text?: string; novelId?: string })
    },
  })
  b.step({
    id: 'layout-demo',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive().default(1),
    }),
    outputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      storageKey: z.string(),
    }),
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'jobId', 'episodeNumber'],
    run: async (input: unknown) => {
      const { demoLayout } = await import('@/services/adapters')
      return demoLayout(input as { baseUrl: string; jobId: string; episodeNumber: number })
    },
  })
  b.edge({ from: 'analyze-demo', to: 'layout-demo', fanIn: 'all' })
  b.step({
    id: 'render-demo',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive().default(1),
      pageNumber: z.number().int().positive().default(1),
    }),
    outputSchema: z.object({
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      pageNumber: z.number().int().positive(),
      renderKey: z.string(),
      thumbnailKey: z.string().optional(),
    }),
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: ['jobId', 'episodeNumber', 'pageNumber'],
    run: async (input: unknown) => {
      const { demoRender } = await import('@/services/adapters')
      return demoRender(
        input as {
          baseUrl: string
          jobId: string
          episodeNumber: number
          pageNumber: number
        },
      )
    },
  })
  b.edge({ from: 'layout-demo', to: 'render-demo', fanIn: 'all' })
  return b.build()
}

export function createProdApiScenario() {
  const b = new ScenarioBuilder('prod-api', '1.0.0')
  b.step({
    id: 'analyze',
    inputSchema: z
      .object({
        baseUrl: z.string().url(),
        text: z.string().optional(),
        novelId: z.string().optional(),
        title: z.string().optional(),
      })
      .refine((v) => !!v.text || !!v.novelId, { message: 'text or novelId required' }),
    outputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      chunkCount: z.number().int().nonnegative().optional(),
    }),
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'novelId', 'text'],
    run: async (input: unknown) => {
      const { baseUrl, text, novelId, title } = z
        .object({
          baseUrl: z.string().url(),
          text: z.string().optional(),
          novelId: z.string().optional(),
          title: z.string().optional(),
        })
        .parse(input)
      const { prodAnalyze } = await import('@/services/adapters')
      return prodAnalyze({ baseUrl, text, novelId, title })
    },
  })
  b.step({
    id: 'layout',
    inputSchema: z.object({ baseUrl: z.string().url(), jobId: z.string() }),
    outputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      storageKey: z.string(),
    }),
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'jobId'],
    run: async (input: unknown) => {
      const { baseUrl, jobId } = z.object({ baseUrl: z.string().url(), jobId: z.string() }).parse(input)
      const { prodLayout } = await import('@/services/adapters')
      return prodLayout({ baseUrl, jobId, episodeNumber: 1 })
    },
  })
  b.edge({ from: 'analyze', to: 'layout', fanIn: 'all' })
  b.step({
    id: 'render',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive().default(1),
    }),
    outputSchema: z.object({
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      pageNumber: z.number().int().positive(),
      renderKey: z.string(),
      thumbnailKey: z.string().optional(),
    }),
    retry: { maxAttempts: 3, backoffMs: 1200, factor: 2, jitter: true },
    idempotencyFrom: ['jobId', 'episodeNumber'],
    run: async (input: unknown) => {
      const { baseUrl, jobId, episodeNumber } = z
        .object({
          baseUrl: z.string().url(),
          jobId: z.string(),
          episodeNumber: z.number().int().positive().default(1),
        })
        .parse(input)
      const { prodRender } = await import('@/services/adapters')
      return prodRender({ baseUrl, jobId, episodeNumber, pageNumber: 1 })
    },
  })
  b.edge({ from: 'layout', to: 'render', fanIn: 'all' })
  return b.build()
}

export function createTestApiScenario() {
  const b = new ScenarioBuilder('test-api', '1.0.0')
  b.step({
    id: 'analyze-test',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      text: z.string().optional().default('テスト用テキスト'),
    }),
    outputSchema: z.object({ baseUrl: z.string().url(), jobId: z.string() }),
    retry: { maxAttempts: 2, backoffMs: 500, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'text'],
    run: async (input: unknown) => {
      const { baseUrl, text } = z
        .object({ baseUrl: z.string().url(), text: z.string().optional() })
        .parse(input)
      const { demoAnalyze } = await import('@/services/adapters')
      return demoAnalyze({ baseUrl, text })
    },
  })
  b.step({
    id: 'layout-test',
    inputSchema: z.object({ baseUrl: z.string().url(), jobId: z.string() }),
    outputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      storageKey: z.string(),
    }),
    retry: { maxAttempts: 2, backoffMs: 500, factor: 2, jitter: true },
    idempotencyFrom: ['baseUrl', 'jobId'],
    run: async (input: unknown) => {
      const { baseUrl, jobId } = z
        .object({ baseUrl: z.string().url(), jobId: z.string() })
        .parse(input)
      const { demoLayout } = await import('@/services/adapters')
      return demoLayout({ baseUrl, jobId, episodeNumber: 1 })
    },
  })
  b.edge({ from: 'analyze-test', to: 'layout-test', fanIn: 'all' })
  b.step({
    id: 'render-test',
    inputSchema: z.object({
      baseUrl: z.string().url(),
      jobId: z.string(),
      episodeNumber: z.number().int().positive().default(1),
      pageNumber: z.number().int().positive().default(1),
    }),
    outputSchema: z.object({
      jobId: z.string(),
      episodeNumber: z.number().int().positive(),
      pageNumber: z.number().int().positive(),
      renderKey: z.string(),
      thumbnailKey: z.string().optional(),
    }),
    retry: { maxAttempts: 2, backoffMs: 500, factor: 2, jitter: true },
    idempotencyFrom: ['jobId', 'episodeNumber', 'pageNumber'],
    run: async (input: unknown) => {
      const { baseUrl, jobId, episodeNumber, pageNumber } = z
        .object({
          baseUrl: z.string().url(),
          jobId: z.string(),
          episodeNumber: z.number().int().positive().default(1),
          pageNumber: z.number().int().positive().default(1),
        })
        .parse(input)
      const { demoRender } = await import('@/services/adapters')
      return demoRender({ baseUrl, jobId, episodeNumber, pageNumber })
    },
  })
  b.edge({ from: 'layout-test', to: 'render-test', fanIn: 'all' })
  return b.build()
}
