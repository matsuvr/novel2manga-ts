import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createDemoApiScenario,
  createNovelToMangaScenario,
  createProdApiScenario,
  createTestApiScenario,
} from '@/agents/scenarios/novel-to-manga'
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

const zRunInput = z.union([
  z.object({
    kind: z.literal('dsl'),
    novelR2Key: z.string().min(1),
    settings: z.object({
      windowTokens: z.number().int().positive(),
      strideTokens: z.number().int().positive(),
    }),
  }),
  z.object({
    kind: z.enum(['demo', 'prod', 'test']),
    baseUrl: z.string().url(),
    text: z.string().optional(),
    novelId: z.string().optional(),
    episodeNumber: z.number().int().positive().optional(),
    pageNumber: z.number().int().positive().optional(),
  }),
])

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const input = zRunInput.parse(body)
    const started = Date.now()
    const scenario =
      input.kind === 'dsl'
        ? createNovelToMangaScenario()
        : input.kind === 'prod'
          ? createProdApiScenario()
          : input.kind === 'test'
            ? createTestApiScenario()
            : createDemoApiScenario()
    // Normalize initialInput for demo (first step expects baseUrl/text/novelId)
    const initialInput =
      input.kind === 'demo'
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
    } else {
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
      return NextResponse.json({ ok: true, kind: 'dsl', summary })
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
