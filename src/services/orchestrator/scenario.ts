import { z } from 'zod'
import type { Edge, RetryPolicy, ScenarioData, StepDefinition } from '@/types/contracts'

// Internal erased step type to store heterogeneous generic steps safely.
// We intentionally widen run signature to (input: unknown) => Promise<unknown> so that
// generic StepDefinition<I,O> can be stored without variance errors. Each concrete step
// still preserves its precise types at the call site; inside the runner we treat them
// opaquely (runtime schemas should validate if enforced later).
type ErasedStep = StepDefinition<unknown, unknown>

export class ScenarioBuilder {
  private id: string
  private version: string
  private steps: ErasedStep[] = []
  private edges: Edge[] = []

  private stepIds = new Set<string>()

  constructor(id: string, version: string) {
    this.id = id
    this.version = version
  }

  step<I, O>(def: StepDefinition<I, O>): this {
    if (this.stepIds.has(def.id)) throw new Error(`Duplicate step id: ${def.id}`)
    this.stepIds.add(def.id)
    // Erase generics for storage (variance safe)
    this.steps.push(def as unknown as ErasedStep)
    return this
  }

  edge(edge: Edge): this {
    this.edges.push(edge)
    return this
  }

  build(): ScenarioData {
    // Basic validation
    const stepIds = new Set(this.steps.map((s) => s.id))
    for (const e of this.edges) {
      if (!stepIds.has(e.from)) throw new Error(`Edge.from not found: ${e.from}`)
      if (!stepIds.has(e.to)) throw new Error(`Edge.to not found: ${e.to}`)
    }

    // Check for cycles using Kahn's algorithm
    const outgoing = new Map<string, string[]>()
    const incomingCount = new Map<string, number>()
    for (const s of this.steps) {
      outgoing.set(s.id, [])
      incomingCount.set(s.id, 0)
    }
    for (const e of this.edges) {
      const list = outgoing.get(e.from)
      if (!list) throw new Error(`Edge.from not initialized: ${e.from}`)
      list.push(e.to)
      incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1)
    }
    const queue: string[] = Array.from(incomingCount.entries())
      .filter(([, c]) => c === 0)
      .map(([id]) => id)
    let visited = 0
    while (queue.length) {
      const n = queue.shift()
      if (n === undefined) break
      visited++
      for (const m of outgoing.get(n) || []) {
        const c = (incomingCount.get(m) || 0) - 1
        incomingCount.set(m, c)
        if (c === 0) queue.push(m)
      }
    }
    if (visited !== this.steps.length) throw new Error('Scenario graph contains a cycle')

    const data: ScenarioData = {
      id: this.id,
      version: this.version,
      steps: this.steps,
      edges: this.edges,
    }
    // Runtime schema validation (ensures shape is sound, run functions are not validated by zod)
    const ScenarioSchema = z.object({
      id: z.string(),
      version: z.string(),
      steps: z.array(
        z.object({
          id: z.string(),
          inputSchema: z.unknown().optional(),
          outputSchema: z.unknown().optional(),
          mapField: z.string().optional(),
        }),
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          fanIn: z.enum(['all', 'quorum']),
        }),
      ),
    })
    ScenarioSchema.parse(data)
    return data
  }
}

export type RunOutputs = Record<string, unknown>

export interface RunOptions {
  initialInput?: unknown
  // Maximum per-step execution time (ms) in this in-memory runner (soft timeout via Promise.race)
  stepTimeoutMs?: number
  // If true, collect errors instead of throwing immediately; failed step output key will contain an Error instance
  collectErrors?: boolean
}

// Minimal in-memory runner for development and tests. This does NOT enqueue to Cloudflare Queues.
export async function runScenario(
  scenario: ScenarioData,
  opts: RunOptions = {},
): Promise<RunOutputs> {
  // Topological order
  const incoming = new Map<string, number>()
  const nexts = new Map<string, string[]>()
  for (const s of scenario.steps) {
    incoming.set(s.id, 0)
    nexts.set(s.id, [])
  }
  for (const e of scenario.edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
    const arr = nexts.get(e.from)
    if (!arr) throw new Error(`Edge.from not initialized: ${e.from}`)
    arr.push(e.to)
  }
  const ready: string[] = []
  // Use forEach to avoid downlevelIteration requirement on Map iterator in older targets
  incoming.forEach((c, id) => {
    if (c === 0) ready.push(id)
  })

  const stepById = new Map(scenario.steps.map((s) => [s.id, s]))
  const outputs: RunOutputs = {}
  const errors: Record<string, unknown> = {}

  // Provide initial input to the first ready node if defined
  const initialAssigned = new Set<string>()
  if (opts.initialInput !== undefined) {
    for (const id of ready) {
      outputs[`${id}:input`] = opts.initialInput
      initialAssigned.add(id)
      break
    }
  }

  const pending = [...ready]
  while (pending.length) {
    const id = pending.shift()
    if (!id) break
    const step = stepById.get(id)
    if (!step) throw new Error(`Step not found: ${id}`)

    // Construct input: prefer explicit previous edge outputs
    const upstream = scenario.edges.filter((e) => e.to === id).map((e) => outputs[e.from])
    const baseInput =
      upstream.length === 0
        ? outputs[`${id}:input`]
        : upstream.length === 1
          ? upstream[0]
          : upstream

    const exec = async (): Promise<unknown> => {
      // Schema validation (input)
      let validatedInput: unknown = baseInput
      if (step.inputSchema && isZodSchema(step.inputSchema)) {
        try {
          validatedInput = step.inputSchema.parse(baseInput)
        } catch (e) {
          throw new Error(`Input validation failed for step ${id}: ${(e as Error).message}`)
        }
      }
      // Fan-out handling
      if (
        step.mapField &&
        validatedInput &&
        typeof validatedInput === 'object' &&
        hasMapFieldArray(validatedInput, step.mapField)
      ) {
        const items = (validatedInput as Record<string, unknown[]>)[step.mapField]
        if (!Array.isArray(items))
          throw new Error(`mapField ${step.mapField} is not an array for step ${id}`)

        const parallelism = step.parallelism
        const runStep = step.run as (arg: unknown) => Promise<unknown>

        // Process items in parallel when parallelism allows it
        if (!parallelism || parallelism >= items.length) {
          // Unlimited parallelism or parallelism >= item count: process all items concurrently
          return Promise.all(items.map((item) => runStep(item)))
        } else {
          // Limited parallelism: process in chunks
          const mapped: unknown[] = []
          for (let i = 0; i < items.length; i += parallelism) {
            const chunk = items.slice(i, i + parallelism)
            const chunkResults = await Promise.all(chunk.map((item) => runStep(item)))
            mapped.push(...chunkResults)
          }
          return mapped
        }
      }
      return (step.run as (arg: unknown) => Promise<unknown>)(validatedInput)
    }

    const withTimeout = async (): Promise<unknown> => {
      const timeoutMs = opts.stepTimeoutMs
      if (!timeoutMs || timeoutMs <= 0) return exec()
      return Promise.race([
        exec(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Step ${id} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ])
    }

    const retryCfg: RetryPolicy | undefined = step.retry as RetryPolicy | undefined
    const maxAttempts = retryCfg?.maxAttempts ?? 1
    let attempt = 0
    while (attempt < maxAttempts) {
      try {
        const res = await withTimeout()
        // Output schema validation
        if (step.outputSchema && isZodSchema(step.outputSchema)) {
          try {
            if (step.mapField && Array.isArray(res)) {
              // Validate each mapped element individually against the single-item schema.
              for (let i = 0; i < res.length; i++) {
                try {
                  step.outputSchema.parse(res[i])
                } catch (e) {
                  throw new Error(
                    `Output validation failed for step ${id} at index ${i}: ${(e as Error).message}`,
                  )
                }
              }
            } else {
              step.outputSchema.parse(res)
            }
          } catch (e) {
            if ((e as Error).message.startsWith('Output validation failed for step')) throw e
            throw new Error(`Output validation failed for step ${id}: ${(e as Error).message}`)
          }
        }
        outputs[id] = res
        break
      } catch (err) {
        attempt++
        if (attempt >= maxAttempts) {
          if (!opts.collectErrors) throw err
          errors[id] = err
          outputs[id] = err
          break
        }
        const backoff = computeBackoffMs(retryCfg, attempt)
        if (backoff > 0) await new Promise((r) => setTimeout(r, backoff))
      }
    }

    for (const n of nexts.get(id) || []) {
      incoming.set(n, (incoming.get(n) || 0) - 1)
      if ((incoming.get(n) || 0) === 0) pending.push(n)
    }
  }

  return outputs
}

function computeBackoffMs(policy: RetryPolicy | undefined, attempt: number): number {
  if (!policy) return 0
  const base = policy.backoffMs ?? 0
  const factor = policy.factor ?? 2
  let delay = base * factor ** (attempt - 1)
  if (policy.jitter) {
    const jitterPortion = delay * 0.2
    delay = delay - jitterPortion + Math.random() * (2 * jitterPortion)
  }
  return Math.min(delay, base * 64) // crude cap
}

// Type guards
type PossibleZod = { parse: (data: unknown) => unknown }
function isZodSchema(value: unknown): value is PossibleZod {
  return (
    !!value &&
    typeof value === 'object' &&
    'parse' in value &&
    typeof (value as Record<string, unknown>).parse === 'function'
  )
}
function hasMapFieldArray(obj: unknown, field: string): obj is Record<string, unknown[]> {
  return (
    !!obj &&
    typeof obj === 'object' &&
    field in obj &&
    Array.isArray((obj as Record<string, unknown>)[field])
  )
}
