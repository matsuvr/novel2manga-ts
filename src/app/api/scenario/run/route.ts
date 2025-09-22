import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runScenario } from '@/services/orchestrator/scenario'
// Novel-to-manga scenario DSL removed. Import remaining API scenarios from new module (to be implemented or already migrated).
import { createDemoApiScenario, createProdApiScenario, createTestApiScenario } from '@/services/orchestrator/scenario-presets'

// No longer using internal stub contracts here; scenario now API-driven

const zRunInput = z.object({
  kind: z.enum(['demo', 'prod', 'test']).default('demo'),
  baseUrl: z.string().url(),
  text: z.string().optional(),
  novelId: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
  pageNumber: z.number().int().positive().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const input = zRunInput.parse(body)
    const started = Date.now()
    const scenario =
      input.kind === 'prod'
        ? createProdApiScenario()
        : input.kind === 'test'
          ? createTestApiScenario()
          : createDemoApiScenario()
    // Normalize initialInput for demo (first step expects baseUrl/text/novelId)
    const initialInput = input.kind === 'demo'
      ? { baseUrl: input.baseUrl, text: input.text, novelId: input.novelId }
      : input
    const outputs = await runScenario(scenario, { initialInput })
    const elapsedMs = Date.now() - started

    if (input.kind === 'demo' || input.kind === 'test' || input.kind === 'prod') {
      // Demo summary
      const key =
  input.kind === 'demo' ? 'render-demo' : input.kind === 'test' ? 'render-test' : 'render'
      const renderOutput = outputs[key] as { renderKey?: string; thumbnailKey?: string } | undefined
      console.log('[scenario/demo] completed', {
        elapsedMs,
        hasRenderKey: !!renderOutput?.renderKey,
      })
      return NextResponse.json({
        ok: true,
        kind: input.kind,
        result: renderOutput,
        elapsedMs,
      })
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT', issues: err.issues },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message ?? 'Unknown error' },
      { status: 500 },
    )
  }
}
