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
    run: async (input) => {
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
    run: async (input) => {
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
    run: async (input) => {
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
    run: async (input) => adapters.storyboard(zReduceOutput.parse(input)),
  })
  b.edge({ from: 'reduce', to: 'storyboard', fanIn: 'all' })

  b.step({
    id: 'prompt',
    inputSchema: zStoryboardOutput,
    outputSchema: zStoryboardOutput,
    parallelism: 1,
    retry: { maxAttempts: 3, backoffMs: 800, factor: 2, jitter: true },
    idempotencyFrom: [],
    run: async (input) => {
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
    run: async (input) => {
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
    run: async (input) => adapters.compose(z.array(zImageResult).parse(input)),
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
    run: async (input) => adapters.publish(zComposeOutput.parse(input)),
  })
  b.edge({ from: 'compose', to: 'publish', fanIn: 'all' })

  return b.build()
}
