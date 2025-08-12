import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'
import { runScenario } from '@/services/orchestrator/scenario'
import {
  zChunkOutput,
  zComposeOutput,
  zImageResult,
  zIngestOutput,
  zReduceOutput,
  zStoryboardOutput,
  zWindowAnalysis,
} from '@/types/contracts'

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

    const ingestParsed = zIngestOutput.safeParse(outputs.ingest)
    const chunkParsed = zChunkOutput.safeParse(outputs.chunk)
    const windowArray = Array.isArray(outputs.analyzeWindow)
      ? z.array(zWindowAnalysis).safeParse(outputs.analyzeWindow)
      : { success: false as const }
    const reduceParsed = zReduceOutput.safeParse(outputs.reduce)
    const storyboardParsed = zStoryboardOutput.safeParse(outputs.storyboard)
    const imageParsed = Array.isArray(outputs.image)
      ? z.array(zImageResult).safeParse(outputs.image)
      : { success: false as const }
    const composeParsed = zComposeOutput.safeParse(outputs.compose)

    const summary = {
      ingest: ingestParsed.success ? ingestParsed.data : undefined,
      chunk: chunkParsed.success ? chunkParsed.data : undefined,
      analyzeCount: windowArray.success ? windowArray.data.length : 0,
      scenes: reduceParsed.success ? reduceParsed.data.scenes.length : 0,
      panels: storyboardParsed.success ? storyboardParsed.data.panels.length : 0,
      images: imageParsed.success ? imageParsed.data.length : 0,
      pages: composeParsed.success ? composeParsed.data.pages.length : 0,
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
