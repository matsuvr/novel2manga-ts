import { z } from 'zod'
import { ScenarioBuilder } from '@/services/orchestrator/scenario'
import * as adapters from '@/services/adapters'
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
// TODO(mcp): Confirm Mastra pipeline/operator APIs for compiling this DSL into Mastra runtime.

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
    run: (input) => adapters.chunk(input as any),
  })
  b.edge({ from: 'ingest', to: 'chunk', fanIn: 'all' })

  b.step({
    id: 'analyzeWindow',
    inputSchema: z.object({ index: z.number().int(), r2Key: z.string() }),
    outputSchema: zWindowAnalysis,
    mapField: 'windows',
    parallelism: 32,
    retry: { maxAttempts: 5, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: ['index', 'r2Key'],
    run: (input) => adapters.analyzeWindow(input as any),
  })
  b.edge({ from: 'chunk', to: 'analyzeWindow', fanIn: 'all' })

  b.step({
    id: 'reduce',
    inputSchema: z.array(zWindowAnalysis),
    outputSchema: zReduceOutput,
    retry: { maxAttempts: 3, backoffMs: 1500, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: (input) => adapters.reduce(input as any),
  })
  b.edge({ from: 'analyzeWindow', to: 'reduce', fanIn: 'all' })

  b.step({
    id: 'storyboard',
    inputSchema: zReduceOutput,
    outputSchema: zStoryboardOutput,
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: (input) => adapters.storyboard(input as any),
  })
  b.edge({ from: 'reduce', to: 'storyboard', fanIn: 'all' })

  b.step({
    id: 'prompt',
    inputSchema: zStoryboardOutput,
    outputSchema: zStoryboardOutput,
    parallelism: 1,
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input) => input as any,
  })
  b.edge({ from: 'storyboard', to: 'prompt', fanIn: 'all' })

  b.step({
    id: 'image',
    inputSchema: z.object({ id: z.string(), sceneId: z.string(), prompt: z.string() }),
    outputSchema: zImageResult,
    mapField: 'panels',
    parallelism: 32,
    retry: { maxAttempts: 5, backoffMs: 1200, factor: 2, jitter: true },
    idempotencyFrom: ['id'],
    run: (input) => adapters.imageGen(input as any),
  })
  b.edge({ from: 'prompt', to: 'image', fanIn: 'all' })

  b.step({
    id: 'compose',
    inputSchema: z.array(zImageResult),
    outputSchema: zComposeOutput,
    retry: { maxAttempts: 3, backoffMs: 2000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: (input) => adapters.compose(input as any),
  })
  b.edge({ from: 'image', to: 'compose', fanIn: 'all' })

  b.step({
    id: 'publish',
    inputSchema: zComposeOutput,
    outputSchema: z.object({ ok: z.literal(true), indexCount: z.number().int().nonnegative() }),
    retry: { maxAttempts: 3, backoffMs: 1000, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: (input) => adapters.publish(input as any),
  })
  b.edge({ from: 'compose', to: 'publish', fanIn: 'all' })

  return b.build()
}
