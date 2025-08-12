import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'
import { runScenario } from '@/services/orchestrator/scenario'

const zRunInput = z.object({
  novelR2Key: z.string().min(1),
  settings: z.object({
    windowTokens: z.number().int().positive(),
    strideTokens: z.number().int().positive(),
  }),
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const input = zRunInput.parse(body)
    const scenario = createNovelToMangaScenario()
    const started = Date.now()
    const outputs = await runScenario(scenario, { initialInput: input })
    const elapsedMs = Date.now() - started

    const summary = {
      ingest: outputs.ingest,
      chunk: outputs.chunk,
      analyzeCount: Array.isArray(outputs.analyzeWindow)
        ? (outputs.analyzeWindow as unknown[]).length
        : 0,
      scenes: (outputs.reduce as any)?.scenes?.length ?? 0,
      panels: (outputs.storyboard as any)?.panels?.length ?? 0,
      images: Array.isArray(outputs.image) ? (outputs.image as unknown[]).length : 0,
      pages: (outputs.compose as any)?.pages?.length ?? 0,
      publish: outputs.publish,
      elapsedMs,
    }
    return NextResponse.json({ ok: true, summary })
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
