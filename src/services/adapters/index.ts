import { z } from 'zod'
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

// These are thin, typed facades around microservices.
// For now, they are stubs suitable for unit testing of the DSL only.

export async function ingest(input: z.infer<typeof zIngestInput>): Promise<z.infer<typeof zIngestOutput>> {
  // Pretend to read and size content
  return {
    manifestKey: `r2://manifests/${input.novelR2Key}.json`,
    totalChars: 10000,
    settings: input.settings,
  }
}

export async function chunk(
  input: z.infer<typeof zIngestOutput>,
): Promise<z.infer<typeof zChunkOutput>> {
  const total = Math.max(1, Math.floor(input.totalChars / (input.settings.windowTokens * 4)))
  const windows = Array.from({ length: total }).map((_, i) => ({ index: i, r2Key: `r2://windows/${i}.txt` }))
  return { windows }
}

export async function analyzeWindow(
  input: { index: number; r2Key: string },
): Promise<z.infer<typeof zWindowAnalysis>> {
  return { index: input.index, beats: [{ id: `b-${input.index}-0`, text: `beat for ${input.r2Key}` }] }
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
  const panels = input.scenes.flatMap((s, i) => s.beats.map((b, j) => ({ id: `p-${i}-${j}`, sceneId: s.id, prompt: b.text })))
  return { panels }
}

export async function promptGen(
  input: { id: string; sceneId: string; prompt: string },
): Promise<{ id: string; sceneId: string; prompt: string }> {
  return input
}

export async function imageGen(
  input: { id: string; sceneId: string; prompt: string },
): Promise<z.infer<typeof zImageResult>> {
  return { panelId: input.id, imageR2Key: `r2://images/${input.id}.png`, seed: 42 }
}

export async function compose(
  input: Array<z.infer<typeof zImageResult>>,
): Promise<z.infer<typeof zComposeOutput>> {
  return { pages: [{ index: 0, r2Key: 'r2://pages/0.png' }] }
}

export async function publish(input: z.infer<typeof zComposeOutput>): Promise<{ ok: true; indexCount: number }> {
  return { ok: true, indexCount: input.pages.length }
}
