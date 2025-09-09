import { z } from 'zod'


// TODO(mcp): Verify queue/message size limits and durable object quotas. Pin links in PR.

// Core identifiers
export const zId = z.string().min(1)
export const zISODate = z.string().datetime({ offset: true })

// Message envelope for inter-service handoff
export const zMessageEnvelope = z.object({
  schemaVersion: z.literal('1.0'),
  jobId: zId,
  stepId: zId,
  correlationId: zId,
  attempt: z.number().int().nonnegative(),
  createdAt: zISODate,
  idempotencyKey: z.string().min(1),
  payload: z.unknown(),
})
export type MessageEnvelope = z.infer<typeof zMessageEnvelope>

// Retry policy per step
export const zRetryPolicy = z.object({
  maxAttempts: z.number().int().positive().default(3),
  backoffMs: z.number().int().positive().default(1000),
  factor: z.number().positive().default(2),
  jitter: z.boolean().default(true),
})
export type RetryPolicy = z.infer<typeof zRetryPolicy>

// Step definition contracts
export const zStepDefinition = z.object({
  id: zId,
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
  // Optional mapper key for fan-out. When provided, the runtime will iterate over payload[key]
  mapField: z.string().optional(),
  parallelism: z.number().int().positive().optional(),
  retry: zRetryPolicy.optional(),
  // Deterministic idempotency key derivation based on input
  idempotencyFrom: z.array(z.string()).default([]),
})
export type StepDefinition<I = unknown, O = unknown> = z.infer<typeof zStepDefinition> & {
  run: (input: I) => Promise<O>
}

export const zEdge = z.object({
  from: zId,
  to: zId,
  fanIn: z.enum(['all', 'quorum']).default('all'),
})
export type Edge = z.infer<typeof zEdge>

export const zScenario = z.object({
  id: zId,
  version: z.string(),
  steps: z.array(zStepDefinition.extend({ run: z.function() })),
  edges: z.array(zEdge),
})
export type ScenarioData = z.infer<typeof zScenario>

// Novel → Manga contracts (lightweight; actual payloads may reference R2 paths)
export const zIngestInput = z.object({
  novelStorageKey: z.string().min(1),
  settings: z.object({
    windowTokens: z.number().int().positive(),
    strideTokens: z.number().int().positive(),
  }),
})
export const zIngestOutput = z.object({
  manifestKey: z.string(),
  totalChars: z.number().int().nonnegative(),
  settings: z.object({
    windowTokens: z.number().int().positive(),
    strideTokens: z.number().int().positive(),
  }),
})

export const zChunkOutput = z.object({
  windows: z.array(z.object({ index: z.number().int().nonnegative(), storageKey: z.string() })),
})

export const zWindowAnalysis = z.object({
  index: z.number().int().nonnegative(),
  beats: z.array(z.object({ id: z.string(), text: z.string() })),
})

export const zReduceOutput = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      beats: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  ),
})

export const zStoryboardOutput = z.object({
  panels: z.array(z.object({ id: z.string(), sceneId: z.string(), prompt: z.string() })),
})

export const zImageResult = z.object({
  panelId: z.string(),
  imageStorageKey: z.string(),
  seed: z.number().int(),
})

export const zComposeOutput = z.object({
  pages: z.array(z.object({ index: z.number().int(), storageKey: z.string() })),
})

// ==============================
// Demo Scenario (API Orchestrator)
// ==============================
export const zDemoAnalyzeInput = z.object({
  baseUrl: z.string().url(),
  text: z.string().optional(),
  novelId: z.string().optional(),
})
export const zDemoAnalyzeOutput = z.object({
  baseUrl: z.string().url(),
  jobId: z.string(),
  chunkCount: z.number().int().nonnegative().optional(),
  mode: z.enum(['demo']).optional(),
})

export const zDemoLayoutInput = z.object({
  baseUrl: z.string().url(),
  jobId: z.string(),
  episodeNumber: z.number().int().positive().default(1),
})
export const zDemoLayoutOutput = z.object({
  baseUrl: z.string().url(),
  jobId: z.string(),
  episodeNumber: z.number().int().positive(),
  storageKey: z.string(),
})

export const zDemoRenderInput = z.object({
  baseUrl: z.string().url(),
  jobId: z.string(),
  episodeNumber: z.number().int().positive().default(1),
  pageNumber: z.number().int().positive().default(1),
})
export const zDemoRenderOutput = z.object({
  jobId: z.string(),
  episodeNumber: z.number().int().positive(),
  pageNumber: z.number().int().positive(),
  renderKey: z.string(),
  thumbnailKey: z.string().optional(),
})
