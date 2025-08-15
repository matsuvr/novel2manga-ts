import { z } from 'zod'
import * as adapters from '@/services/adapters'
import { ScenarioBuilder } from '@/services/orchestrator/scenario'
import {
  zChunkOutput,
  zComposeOutput,
  zImageResult,
  zIngestInput,
  zIngestOutput,
  zReduceOutput,
  zStoryboardOutput,
  zWindowAnalysis,
} from '@/types/contracts'

// Canonical, typed scenario used by the Web UI and runtime.
// NOTE: Mastra 依存は撤廃。シナリオDSLは独自実行器で扱う。

export function createNovelToMangaScenario() {
  const b = new ScenarioBuilder('novel-to-manga', '1.0.0')

  b.step({
    id: 'ingest',
    inputSchema: z.object({}).passthrough(),
    outputSchema: zIngestOutput,
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: ['novelR2Key'],
    run: (input: unknown) => adapters.ingest(zIngestInput.parse(input)),
  })

  b.step({
    id: 'chunk',
    inputSchema: zIngestOutput,
    outputSchema: zChunkOutput,
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: ['manifestKey'],
    run: async (input: unknown) => {
      // Validate upstream output strictly
      const parsed = zIngestOutput.parse(input)
      return adapters.chunk(parsed)
    },
  })
  b.edge({ from: 'ingest', to: 'chunk', fanIn: 'all' })

  b.step({
    id: 'analyzeWindow',
    // For fan-out steps using mapField, the inputSchema must validate the FULL upstream object
    // (which contains the array to fan out), not the per-item shape. We then validate each
    // item inside run(). This avoids failing validation on missing fields like index/r2Key
    // at the container level.
    inputSchema: z.object({
      windows: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          r2Key: z.string().min(1),
        }),
      ),
    }),
    outputSchema: zWindowAnalysis,
    mapField: 'windows',
    parallelism: 32,
    retry: { maxAttempts: 5, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: ['index', 'r2Key'],
    run: async (input: unknown) => {
      // Each item from windows[] is passed here due to mapField handling.
      const itemSchema = z.object({
        index: z.number().int().nonnegative(),
        r2Key: z.string().min(1),
      })
      const parsed = itemSchema.parse(input)
      return adapters.analyzeWindow(parsed)
    },
  })
  b.edge({ from: 'chunk', to: 'analyzeWindow', fanIn: 'all' })

  b.step({
    id: 'reduce',
    inputSchema: z.array(zWindowAnalysis),
    outputSchema: zReduceOutput,
    retry: { maxAttempts: 3, backoffMs: 1500, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input: unknown) => {
      const parsed = z.array(zWindowAnalysis).parse(input)
      return adapters.reduce(parsed)
    },
  })
  b.edge({ from: 'analyzeWindow', to: 'reduce', fanIn: 'all' })

  b.step({
    id: 'storyboard',
    inputSchema: zReduceOutput,
    outputSchema: zStoryboardOutput,
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input: unknown) => adapters.storyboard(zReduceOutput.parse(input)),
  })
  b.edge({ from: 'reduce', to: 'storyboard', fanIn: 'all' })

  b.step({
    id: 'prompt',
    inputSchema: zStoryboardOutput,
    outputSchema: zStoryboardOutput,
    parallelism: 1,
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input: unknown) => {
      const parsed = zStoryboardOutput.parse(input)
      // For each panel, we could enrich prompt later; return unchanged for now.
      return parsed
    },
  })
  b.edge({ from: 'storyboard', to: 'prompt', fanIn: 'all' })

  b.step({
    id: 'image',
    // Similar to analyzeWindow: container schema with panels array for fan-out
    inputSchema: z.object({
      panels: z.array(
        z.object({
          id: z.string().min(1),
          sceneId: z.string().min(1),
          prompt: z.string().min(1),
        }),
      ),
    }),
    outputSchema: zImageResult,
    mapField: 'panels',
    parallelism: 32,
    retry: { maxAttempts: 5, backoffMs: 1200, factor: 2, jitter: true },
    idempotencyFrom: ['id'],
    run: async (input: unknown) => {
      const itemSchema = z.object({
        id: z.string().min(1),
        sceneId: z.string().min(1),
        prompt: z.string().min(1),
      })
      return adapters.imageGen(itemSchema.parse(input))
    },
  })
  b.edge({ from: 'prompt', to: 'image', fanIn: 'all' })

  b.step({
    id: 'compose',
    inputSchema: z.array(zImageResult),
    outputSchema: zComposeOutput,
    retry: { maxAttempts: 3, backoffMs: 2000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input: unknown) => adapters.compose(z.array(zImageResult).parse(input)),
  })
  b.edge({ from: 'image', to: 'compose', fanIn: 'all' })

  b.step({
    id: 'publish',
    inputSchema: zComposeOutput,
    outputSchema: z.object({
      ok: z.literal(true),
      indexCount: z.number().int().nonnegative(),
    }),
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input: unknown) => adapters.publish(zComposeOutput.parse(input)),
  })
  b.edge({ from: 'compose', to: 'publish', fanIn: 'all' })

  return b.build()
}

// デモ用: APIオーケストレーション（analyze→layout→render）
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
    // ランナーが inputSchema による検証を行うため、ここでの重複parseは不要
    run: (input: unknown) =>
      adapters.demoAnalyze(input as { baseUrl: string; text?: string; novelId?: string }),
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
    run: async (input: unknown) =>
      adapters.demoLayout(input as { baseUrl: string; jobId: string; episodeNumber: number }),
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
    run: (input: unknown) =>
      adapters.demoRender(
        input as {
          baseUrl: string
          jobId: string
          episodeNumber: number
          pageNumber: number
        },
      ),
  })
  b.edge({ from: 'layout-demo', to: 'render-demo', fanIn: 'all' })

  return b.build()
}

// 本番用: analyze → layout → render（厳格バリデーション）
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
      .refine((v) => !!v.text || !!v.novelId, {
        message: 'text or novelId required',
      }),
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
      const { baseUrl, jobId } = z
        .object({ baseUrl: z.string().url(), jobId: z.string() })
        .parse(input)
      const { prodLayout } = await import('@/services/adapters')
      // 現状は第1話固定。将来はepisodes APIから動的選択
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

// テスト用: バリデーション緩和・固定データ注入（短縮版）
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
