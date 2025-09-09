import { z } from 'zod'
import type {
  zChunkOutput,
  zComposeOutput,
  zDemoAnalyzeInput,
  zDemoAnalyzeOutput,
  zDemoLayoutInput,
  zDemoLayoutOutput,
  zDemoRenderInput,
  zDemoRenderOutput,
  zImageResult,
  zIngestInput,
  zIngestOutput,
  zReduceOutput,
  zStoryboardOutput,
  zWindowAnalysis,
} from '@/types/contracts'

// These are thin, typed facades around microservices.
// For now, they are stubs suitable for unit testing of the DSL only.

export async function ingest(
  input: z.infer<typeof zIngestInput>,
): Promise<z.infer<typeof zIngestOutput>> {
  // Pretend to read and size content
  return {
    manifestKey: `storage://manifests/${input.novelStorageKey}.json`,
    totalChars: 10000,
    settings: input.settings,
  }
}

export async function chunk(
  input: z.infer<typeof zIngestOutput>,
): Promise<z.infer<typeof zChunkOutput>> {
  const total = Math.max(1, Math.floor(input.totalChars / (input.settings.windowTokens * 4)))
  const windows = Array.from({ length: total }).map((_, i) => ({
    index: i,
    storageKey: `storage://windows/${i}.txt`,
  }))
  return { windows }
}

export async function analyzeWindow(input: {
  index: number
  r2Key: string
}): Promise<z.infer<typeof zWindowAnalysis>> {
  return {
    index: input.index,
    beats: [{ id: `b-${input.index}-0`, text: `beat for ${input.r2Key}` }],
  }
}

export async function reduce(
  inputs: Array<z.infer<typeof zWindowAnalysis>>,
): Promise<z.infer<typeof zReduceOutput>> {
  const beats = inputs.flatMap((w) => w.beats)
  return { scenes: [{ id: 's-0', title: 'Scene 0', beats }] }
}

export async function storyboard(
  input: z.infer<typeof zReduceOutput>,
): Promise<z.infer<typeof zStoryboardOutput>> {
  const panels = input.scenes.flatMap((s, i) =>
    s.beats.map((b, j) => ({
      id: `p-${i}-${j}`,
      sceneId: s.id,
      prompt: b.text,
    })),
  )
  return { panels }
}

export async function imageGen(input: {
  id: string
  sceneId: string
  prompt: string
}): Promise<z.infer<typeof zImageResult>> {
  return {
    panelId: input.id,
    imageStorageKey: `storage://images/${input.id}.png`,
    seed: 42,
  }
}

export async function compose(
  _input: Array<z.infer<typeof zImageResult>>,
): Promise<z.infer<typeof zComposeOutput>> {
  return { pages: [{ index: 0, storageKey: 'storage://pages/0.png' }] }
}

export async function publish(
  input: z.infer<typeof zComposeOutput>,
): Promise<{ ok: true; indexCount: number }> {
  return { ok: true, indexCount: input.pages.length }
}

// ==============================
// Demo Orchestrator Adapters
// ==============================
export async function demoAnalyze(
  input: z.infer<typeof zDemoAnalyzeInput>,
): Promise<z.infer<typeof zDemoAnalyzeOutput>> {
  const payload = input.text
    ? { text: input.text }
    : input.novelId
      ? { novelId: input.novelId }
      : { text: 'デモ用テキストです。' }
  const res = await fetch(`${input.baseUrl}/api/analyze?demo=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`[demoAnalyze] failed: ${res.status}`)
  const ResponseSchema = z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    jobId: z.string().optional(),
    data: z.object({ jobId: z.string().optional() }).partial().optional(),
    mode: z.enum(['demo']).optional(),
    chunkCount: z.number().int().nonnegative().optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  const jobId = json.id ?? json.jobId ?? json.data?.jobId
  if (!jobId) throw new Error('[demoAnalyze] jobId missing in response')
  return {
    baseUrl: input.baseUrl,
    jobId,
    mode: json.mode ?? 'demo',
    chunkCount: json.chunkCount,
  }
}

export async function demoLayout(
  input: z.infer<typeof zDemoLayoutInput>,
): Promise<z.infer<typeof zDemoLayoutOutput>> {
  const res = await fetch(`${input.baseUrl}/api/layout/generate?demo=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: input.jobId,
      episodeNumber: input.episodeNumber,
    }),
  })
  if (!res.ok) throw new Error(`[demoLayout] failed: ${res.status}`)
  const ResponseSchema = z.object({
    success: z.boolean().optional(),
    storageKey: z.string().optional(),
    layoutPath: z.string().optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  const storageKey = json.storageKey ?? json.layoutPath
  if (!storageKey) throw new Error('[demoLayout] storageKey missing in response')
  return {
    baseUrl: input.baseUrl,
    jobId: input.jobId,
    episodeNumber: input.episodeNumber,
    storageKey,
  }
}

export async function demoRender(
  input: z.infer<typeof zDemoRenderInput>,
): Promise<z.infer<typeof zDemoRenderOutput>> {
  // デモ用ルートは render API に demo=1 を付与して、DB/YAML 依存を避ける
  const res = await fetch(`${input.baseUrl}/api/render?demo=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: input.jobId,
      episodeNumber: input.episodeNumber,
      pageNumber: input.pageNumber,
    }),
  })
  if (!res.ok) throw new Error(`[demoRender] failed: ${res.status}`)
  const ResponseSchema = z.object({
    success: z.boolean().optional(),
    renderKey: z.string().optional(),
    thumbnailKey: z.string().optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  if (!json.renderKey) throw new Error('[demoRender] renderKey missing in response')
  // json.renderKey は上で存在チェック済み
  return {
    jobId: input.jobId,
    episodeNumber: input.episodeNumber,
    pageNumber: input.pageNumber,
    renderKey: json.renderKey,
    thumbnailKey: json.thumbnailKey,
  }
}

// ==============================
// Production Orchestrator Adapters
// ==============================

export async function prodAnalyze(input: {
  baseUrl: string
  text?: string
  novelId?: string
  title?: string
}): Promise<{
  baseUrl: string
  jobId: string
  chunkCount?: number
}> {
  const payload = input.text
    ? { text: input.text, title: input.title }
    : input.novelId
      ? { novelId: input.novelId, title: input.title }
      : null
  if (!payload) throw new Error('[prodAnalyze] either text or novelId is required')
  const res = await fetch(`${input.baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`[prodAnalyze] failed: ${res.status}`)
  const ResponseSchema = z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    jobId: z.string().optional(),
    data: z
      .object({
        jobId: z.string().optional(),
        chunkCount: z.number().int().nonnegative().optional(),
      })
      .partial()
      .optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  const jobId = json.id ?? json.jobId ?? json.data?.jobId
  if (!jobId) throw new Error('[prodAnalyze] jobId missing in response')
  return { baseUrl: input.baseUrl, jobId, chunkCount: json.data?.chunkCount }
}

export async function prodLayout(input: {
  baseUrl: string
  jobId: string
  episodeNumber: number
}): Promise<{
  baseUrl: string
  jobId: string
  episodeNumber: number
  storageKey: string
}> {
  const res = await fetch(`${input.baseUrl}/api/layout/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: input.jobId,
      episodeNumber: input.episodeNumber,
    }),
  })
  if (!res.ok) throw new Error(`[prodLayout] failed: ${res.status}`)
  const ResponseSchema = z.object({
    storageKey: z.string().optional(),
    layoutPath: z.string().optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  const storageKey = json.storageKey ?? json.layoutPath
  if (!storageKey) throw new Error('[prodLayout] storageKey missing in response')
  return {
    baseUrl: input.baseUrl,
    jobId: input.jobId,
    episodeNumber: input.episodeNumber,
    storageKey,
  }
}

export async function prodRender(input: {
  baseUrl: string
  jobId: string
  episodeNumber: number
  pageNumber: number
}): Promise<{
  jobId: string
  episodeNumber: number
  pageNumber: number
  renderKey: string
  thumbnailKey?: string
}> {
  const res = await fetch(`${input.baseUrl}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: input.jobId,
      episodeNumber: input.episodeNumber,
      pageNumber: input.pageNumber,
    }),
  })
  if (!res.ok) throw new Error(`[prodRender] failed: ${res.status}`)
  const ResponseSchema = z.object({
    renderKey: z.string().optional(),
    thumbnailKey: z.string().optional(),
  })
  const json = ResponseSchema.parse(await res.json())
  if (!json.renderKey) throw new Error('[prodRender] renderKey missing in response')
  return {
    jobId: input.jobId,
    episodeNumber: input.episodeNumber,
    pageNumber: input.pageNumber,
    renderKey: json.renderKey,
    thumbnailKey: json.thumbnailKey,
  }
}
