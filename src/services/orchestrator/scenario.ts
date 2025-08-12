import { z } from 'zod'
import type { Edge, ScenarioData, StepDefinition } from '@/types/contracts'

export class ScenarioBuilder {
  private id: string
  private version: string
  private steps: StepDefinition[] = []
  private edges: Edge[] = []

  private stepIds = new Set<string>()

  constructor(id: string, version: string) {
    this.id = id
    this.version = version
  }

  step<I, O>(def: StepDefinition<I, O>): this {
    if (this.stepIds.has(def.id)) throw new Error(`Duplicate step id: ${def.id}`)
    this.stepIds.add(def.id)
    this.steps.push(def)
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
      outgoing.get(e.from)!.push(e.to)
      incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1)
    }
    const queue: string[] = Array.from(incomingCount.entries())
      .filter(([, c]) => c === 0)
      .map(([id]) => id)
    let visited = 0
    while (queue.length) {
      const n = queue.shift()!
      visited++
      for (const m of outgoing.get(n) || []) {
        const c = (incomingCount.get(m) || 0) - 1
        incomingCount.set(m, c)
        if (c === 0) queue.push(m)
      }
    }
    if (visited !== this.steps.length) throw new Error('Scenario graph contains a cycle')

    const data: ScenarioData = { id: this.id, version: this.version, steps: this.steps, edges: this.edges }
    // Runtime schema validation (ensures shape is sound, run functions are not validated by zod)
    const ScenarioSchema = z.object({
      id: z.string(),
      version: z.string(),
      steps: z.array(z.object({ id: z.string() } as any)),
      edges: z.array(z.object({ from: z.string(), to: z.string(), fanIn: z.enum(['all', 'quorum']) })),
    })
    ScenarioSchema.parse(data)
    return data
  }
}

export type RunOutputs = Record<string, unknown>

export interface RunOptions {
  initialInput?: unknown
}

// Minimal in-memory runner for development and tests. This does NOT enqueue to Cloudflare Queues.
export async function runScenario(scenario: ScenarioData, opts: RunOptions = {}): Promise<RunOutputs> {
  // Topological order
  const incoming = new Map<string, number>()
  const nexts = new Map<string, string[]>()
  for (const s of scenario.steps) {
    incoming.set(s.id, 0)
    nexts.set(s.id, [])
  }
  for (const e of scenario.edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
    nexts.get(e.from)!.push(e.to)
  }
  const ready: string[] = []
  for (const [id, c] of incoming.entries()) if (c === 0) ready.push(id)

  const stepById = new Map(scenario.steps.map((s) => [s.id, s]))
  const outputs: RunOutputs = {}

  // Provide initial input to the first ready node if defined
  const initialAssigned = new Set<string>()
  if (opts.initialInput !== undefined) {
    for (const id of ready) {
      outputs[id + ':input'] = opts.initialInput
      initialAssigned.add(id)
      break
    }
  }

  const pending = [...ready]
  while (pending.length) {
    const id = pending.shift()!
    const step = stepById.get(id)!

    // Construct input: prefer explicit previous edge outputs
    const upstream = scenario.edges.filter((e) => e.to === id).map((e) => outputs[e.from])
    const baseInput = upstream.length === 0 ? outputs[id + ':input'] : upstream.length === 1 ? upstream[0] : upstream

    let result: unknown
    if (step.mapField && baseInput && typeof baseInput === 'object' && step.mapField in (baseInput as any)) {
      const items = (baseInput as any)[step.mapField]
      if (!Array.isArray(items)) throw new Error(`mapField ${step.mapField} is not an array for step ${id}`)
      const mapped = []
      for (const item of items) {
        mapped.push(await (step as any).run(item))
      }
      result = mapped
    } else {
      result = await (step as any).run(baseInput)
    }
    outputs[id] = result

    for (const n of nexts.get(id) || []) {
      incoming.set(n, (incoming.get(n) || 0) - 1)
      if ((incoming.get(n) || 0) === 0) pending.push(n)
    }
  }

  return outputs
}

