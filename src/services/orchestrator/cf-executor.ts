import { createHash } from 'crypto'
import type { MessageEnvelope, ScenarioData } from '@/types/contracts'

/**
 * Cloudflare Executor Skeleton (Queues + Durable Objects)
 *
 * References:
 * - Cloudflare Queues: https://developers.cloudflare.com/queues/
 * - Durable Objects: https://developers.cloudflare.com/durable-objects/
 * - D1: https://developers.cloudflare.com/d1/
 * - R2: https://developers.cloudflare.com/r2/
 * - Mastra overview: https://mastra.ai/docs
 */

// Lightweight queue producer interface to decouple from direct Env types.
export interface QueueProducer {
  send: (message: MessageEnvelope) => Promise<void>
  sendBatch?: (messages: MessageEnvelope[]) => Promise<void>
}

// Coordinator (Durable Object) interface for tracking job state and joins.
export interface JobCoordinator {
  initializeJob(params: { jobId: string; scenarioId: string; version: string }): Promise<void>
  markStepComplete(params: { jobId: string; stepId: string; shardKey?: string }): Promise<void>
  // Emits next-step messages when prerequisites are satisfied.
  scheduleNext(params: { jobId: string; fromStepId: string; outputsRef: string }): Promise<void>
}

export interface CloudflareExecutorDeps {
  getQueueForStep: (stepId: string) => QueueProducer
  coordinator: JobCoordinator
  now?: () => Date
  // Optional function to persist large payloads to R2/S3 and return a reference key
  persistPayload?: (payload: unknown) => Promise<string>
}

export class CloudflareScenarioExecutor {
  constructor(private deps: CloudflareExecutorDeps) {}

  async start(scenario: ScenarioData, jobId: string, initialPayload: unknown): Promise<void> {
    const { coordinator } = this.deps
    await coordinator.initializeJob({
      jobId,
      scenarioId: scenario.id,
      version: scenario.version,
    })

    // Identify entry steps (no incoming edges)
    const incoming = new Map<string, number>()
    for (const s of scenario.steps) incoming.set(s.id, 0)
    for (const e of scenario.edges) incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
    const entrySteps = Array.from(incoming.entries())
      .filter(([, c]) => c === 0)
      .map(([id]) => id)

    for (const stepId of entrySteps) {
      const env = this.createEnvelope(jobId, stepId, 0, initialPayload)
      await this.deps.getQueueForStep(stepId).send(env)
    }
  }

  private createEnvelope(
    jobId: string,
    stepId: string,
    attempt: number,
    payload: unknown,
  ): MessageEnvelope {
    return {
      schemaVersion: '1.0',
      jobId,
      stepId,
      correlationId: `${jobId}:${stepId}:${Date.now()}`,
      attempt,
      createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      idempotencyKey: this.deriveIdempotencyKey(jobId, stepId, payload),
      payload,
    }
  }

  private deriveIdempotencyKey(jobId: string, stepId: string, payload: unknown): string {
    const canonical = canonicalStringify(payload)
    const hash = createHash('sha256')
      .update(jobId)
      .update(':')
      .update(stepId)
      .update(':')
      .update(canonical)
      .digest('hex')
    // Truncate to 16 hex chars for brevity (64 bits)
    return `${stepId}:${hash.slice(0, 16)}`
  }
}

// Stable JSON stringify with sorted object keys (handles arrays & primitives recursively)
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStringify(v)).join(',')}]`
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`)
  return `{${entries.join(',')}}`
}
